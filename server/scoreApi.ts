import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import type { Request, Response } from "express";

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

type ScoreRow = RowDataPacket & {
  totalRecords: number | string;
  higherScores: number | string;
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
  if (typeof candidate.duration !== "number" || !Number.isInteger(candidate.duration) || ![30, 60, 90].includes(candidate.duration)) return null;
  const playId = candidate.playId as string;
  const mode = candidate.mode as "basic" | "hard";
  const score = candidate.score as number;
  const wpm = candidate.wpm as number;
  const accuracy = candidate.accuracy as number;
  const completed = candidate.completed as number;
  const bestStreak = candidate.bestStreak as number;
  const duration = candidate.duration as number;
  return {
    playId,
    mode,
    nickname,
    score,
    wpm: Number(wpm.toFixed(2)),
    accuracy: Number(accuracy.toFixed(2)),
    completed,
    bestStreak,
    duration,
  };
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const recent = (requestBuckets.get(ip) ?? []).filter(timestamp => now - timestamp < RATE_WINDOW_MS);
  recent.push(now);
  requestBuckets.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

async function getRanking(db: Pool, record: ScoreRecord) {
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

export async function handleRecordScore(req: Request, res: Response) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "POSTのみ利用できます。" });
  const origin = req.get("origin");
  if (origin && origin !== `${req.protocol}://${req.get("host")}`) {
    return res.status(403).json({ ok: false, message: "許可されていない送信元です。" });
  }
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (isRateLimited(ip)) return res.status(429).json({ ok: false, message: "短時間の送信回数が上限を超えました。少し待ってください。" });

  const record = validateRecord(req.body);
  if (!record) return res.status(422).json({ ok: false, message: "結果データの形式が正しくありません。" });
  const db = getPool();
  if (!db) return res.status(503).json({ ok: false, message: "ランキングDBが設定されていません。" });

  try {
    await db.execute(
      "INSERT INTO typing_scores (play_id, nickname, score, wpm, accuracy_percent, completed_terms, best_streak, duration_seconds, mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [record.playId, record.nickname, record.score, record.wpm, record.accuracy, record.completed, record.bestStreak, record.duration, record.mode],
    );
    const ranking = await getRanking(db, record);
    return res.status(201).json({ ok: true, ...ranking });
  } catch (error: unknown) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
    if (!duplicate) {
      console.error("[Score API] Failed to save score", error);
      return res.status(500).json({ ok: false, message: "ランキングを保存できませんでした。" });
    }
    const ranking = await getRanking(db, record);
    return res.status(200).json({ ok: true, ...ranking, duplicate: true });
  }
}

export function closeScorePool() {
  const current = pool;
  pool = null;
  return current?.end();
}
