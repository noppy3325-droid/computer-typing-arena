import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import type { Request, Response } from "express";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";

export type ScoreRecord = {
  playId: string;
  mode: "basic" | "hard";
  nickname: string;
  score: number;
  wpm: number;
  accuracy: number;
  completed: number;
  bestStreak: number;
  duration: number;
};

type StoredScore = ScoreRecord & { recordedAt: string };

type ScoreRow = RowDataPacket & {
  totalRecords: number | string;
  higherScores: number | string;
};

type LeaderboardRow = RowDataPacket & {
  rank: number | string;
  nickname: string;
  score: number | string;
  wpm: number | string;
};

export type LeaderboardEntry = {
  rank: number;
  nickname: string;
  score: number;
  wpm: number;
};

let pool: Pool | null = null;
const requestBuckets = new Map<string, number[]>();
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 30;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  pool ??= mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    charset: "utf8mb4",
  });
  return pool;
}

function getLocalStorePath() {
  return process.env.RANKING_STORE_PATH ?? path.resolve(process.cwd(), "data", "typing-arena-scores.json");
}

function isStoredScore(value: unknown): value is StoredScore {
  const record = validateRecord(value);
  return record !== null && typeof (value as { recordedAt?: unknown }).recordedAt === "string";
}

function readLocalScores() {
  const storePath = getLocalStorePath();
  if (!existsSync(storePath)) return [] as StoredScore[];
  try {
    const raw = JSON.parse(readFileSync(storePath, "utf8")) as unknown;
    if (!Array.isArray(raw) || !raw.every(isStoredScore)) throw new Error("Invalid score store");
    return raw;
  } catch (error) {
    throw new Error(`ローカルランキング記録を読み込めませんでした: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

function writeLocalScores(scores: StoredScore[]) {
  const storePath = getLocalStorePath();
  mkdirSync(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(scores), { encoding: "utf8", mode: 0o600 });
  renameSync(temporaryPath, storePath);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateRecord(value: unknown): ScoreRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ScoreRecord>;
  const nickname = typeof candidate.nickname === "string" ? candidate.nickname.trim() : "";
  if (!nickname || nickname.length > 24) return null;
  if (!/^[^<>\u0000-\u001f]+$/.test(nickname)) return null;
  if (candidate.mode !== "basic" && candidate.mode !== "hard") return null;
  if (typeof candidate.playId !== "string" || !/^[A-Za-z0-9_-]{12,80}$/.test(candidate.playId)) return null;
  if (typeof candidate.score !== "number" || !Number.isInteger(candidate.score) || candidate.score < 0 || candidate.score > 2_000_000) return null;
  if (!isFiniteNumber(candidate.wpm) || candidate.wpm < 0 || candidate.wpm > 100_000) return null;
  if (!isFiniteNumber(candidate.accuracy) || candidate.accuracy < 0 || candidate.accuracy > 100) return null;
  if (typeof candidate.completed !== "number" || !Number.isInteger(candidate.completed) || candidate.completed < 0 || candidate.completed > 10_000) return null;
  if (typeof candidate.bestStreak !== "number" || !Number.isInteger(candidate.bestStreak) || candidate.bestStreak < 0 || candidate.bestStreak > 10_000) return null;
  if (typeof candidate.duration !== "number" || candidate.duration !== 60) return null;

  return {
    playId: candidate.playId,
    mode: candidate.mode,
    nickname,
    score: candidate.score,
    wpm: Number(candidate.wpm.toFixed(2)),
    accuracy: Number(candidate.accuracy.toFixed(2)),
    completed: candidate.completed,
    bestStreak: candidate.bestStreak,
    duration: candidate.duration,
  };
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const recent = (requestBuckets.get(ip) ?? []).filter(timestamp => now - timestamp < RATE_WINDOW_MS);
  recent.push(now);
  requestBuckets.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

export function isSameHostOrigin(origin: string | undefined, host: string | undefined) {
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host.split(",")[0].trim();
  } catch {
    return false;
  }
}

export function calculateRanking(scores: Array<{ mode: "basic" | "hard"; score: number }>, record: Pick<ScoreRecord, "mode" | "score">) {
  const sameModeScores = scores.filter(score => score.mode === record.mode);
  return {
    rank: sameModeScores.filter(score => score.score > record.score).length + 1,
    totalRecords: sameModeScores.length,
  };
}

export function calculateTopScores(
  scores: Array<Pick<ScoreRecord, "mode" | "nickname" | "score" | "wpm">>,
  mode: ScoreRecord["mode"],
): LeaderboardEntry[] {
  return scores
    .filter((score) => score.mode === mode)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((score) => ({
      rank: scores.filter((candidate) => candidate.mode === mode && candidate.score > score.score).length + 1,
      nickname: score.nickname,
      score: score.score,
      wpm: score.wpm,
    }));
}

async function getDatabaseRanking(db: Pool, record: ScoreRecord) {
  const [rows] = await db.query<ScoreRow[]>(
    "SELECT COUNT(*) AS totalRecords, COALESCE(SUM(score > ?), 0) AS higherScores FROM typing_scores WHERE mode = ?",
    [record.score, record.mode],
  );
  const row = rows[0] ?? { totalRecords: 0, higherScores: 0 };
  return {
    rank: Number(row.higherScores) + 1,
    totalRecords: Number(row.totalRecords),
  };
}

async function getDatabaseTopScores(db: Pool, mode: ScoreRecord["mode"]): Promise<LeaderboardEntry[]> {
  const [rows] = await db.query<LeaderboardRow[]>(
    "SELECT 1 + (SELECT COUNT(*) FROM typing_scores higher WHERE higher.mode = ranked.mode AND higher.score > ranked.score) AS rank, ranked.nickname, ranked.score, ranked.wpm FROM typing_scores ranked WHERE ranked.mode = ? ORDER BY ranked.score DESC, ranked.recorded_at ASC, ranked.id ASC LIMIT 3",
    [mode],
  );
  return rows.map((row) => ({
    rank: Number(row.rank),
    nickname: row.nickname,
    score: Number(row.score),
    wpm: Number(row.wpm),
  }));
}

function isDuplicateScoreError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}

async function saveToDatabase(db: Pool, record: ScoreRecord) {
  try {
    await db.execute(
      "INSERT INTO typing_scores (play_id, nickname, score, wpm, accuracy_percent, completed_terms, best_streak, duration_seconds, mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [record.playId, record.nickname, record.score, record.wpm, record.accuracy, record.completed, record.bestStreak, record.duration, record.mode],
    );
    const [ranking, topScores] = await Promise.all([getDatabaseRanking(db, record), getDatabaseTopScores(db, record.mode)]);
    return { status: 201, ranking: { ...ranking, topScores }, duplicate: false };
  } catch (error: unknown) {
    if (!isDuplicateScoreError(error)) throw error;
    const [ranking, topScores] = await Promise.all([getDatabaseRanking(db, record), getDatabaseTopScores(db, record.mode)]);
    return { status: 200, ranking: { ...ranking, topScores }, duplicate: true };
  }
}

function saveToLocalStore(record: ScoreRecord) {
  const scores = readLocalScores();
  const duplicate = scores.some(score => score.playId === record.playId);
  if (!duplicate) {
    scores.push({ ...record, recordedAt: new Date().toISOString() });
    writeLocalScores(scores);
  }
  return {
    status: duplicate ? 200 : 201,
    ranking: { ...calculateRanking(scores, record), topScores: calculateTopScores(scores, record.mode) },
    duplicate,
  };
}

export async function handleRecordScore(req: Request, res: Response) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "POSTのみ利用できます。" });
  const origin = req.get("origin");
  const requestHost = req.get("host");
  if (!isSameHostOrigin(origin, requestHost)) {
    return res.status(403).json({ ok: false, message: "許可されていない送信元です。" });
  }
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (isRateLimited(ip)) return res.status(429).json({ ok: false, message: "短時間の送信回数が上限を超えました。少し待ってください。" });

  const record = validateRecord(req.body);
  if (!record) return res.status(422).json({ ok: false, message: "結果データの形式が正しくありません。" });

  try {
    const db = getPool();
    const saved = db ? await saveToDatabase(db, record) : saveToLocalStore(record);
    return res.status(saved.status).json({ ok: true, ...saved.ranking, ...(saved.duplicate ? { duplicate: true } : {}) });
  } catch (error) {
    console.error("[Score API] Failed to save score", error);
    return res.status(500).json({ ok: false, message: "ランキングを保存できませんでした。" });
  }
}

export function closeScorePool() {
  const current = pool;
  pool = null;
  return current?.end();
}
