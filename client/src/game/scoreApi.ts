/** Same-origin result transport: Manus uses its database API, while XServer falls back to the PHP/CSV endpoint. */
import type { GameMode } from "@/game/gameModes";

export type ScoreRecord = {
  playId: string;
  mode: GameMode;
  nickname: string;
  score: number;
  wpm: number;
  accuracy: number;
  completed: number;
  bestStreak: number;
  duration: number;
};

export type ScoreRecordResponse = {
  rank: number;
  totalRecords: number;
  topScores: LeaderboardEntry[];
};

export type LeaderboardEntry = {
  rank: number;
  nickname: string;
  score: number;
  wpm: number;
};

type ScoreApiBody = { ok?: boolean; message?: string; rank?: number; totalRecords?: number; topScores?: LeaderboardEntry[] };

function parseTopScores(value: unknown): LeaderboardEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is LeaderboardEntry => (
    typeof entry === "object" && entry !== null
    && Number.isInteger((entry as LeaderboardEntry).rank)
    && typeof (entry as LeaderboardEntry).nickname === "string"
    && typeof (entry as LeaderboardEntry).score === "number"
    && typeof (entry as LeaderboardEntry).wpm === "number"
  )).slice(0, 3);
}

export function toScorePayload(record: ScoreRecord): ScoreRecord {
  return {
    playId: record.playId,
    mode: record.mode,
    nickname: record.nickname,
    score: record.score,
    wpm: record.wpm,
    accuracy: record.accuracy,
    completed: record.completed,
    bestStreak: record.bestStreak,
    duration: record.duration,
  };
}

async function postScore(endpoint: string, record: ScoreRecord) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toScorePayload(record)),
  });
  const body = await response.json().catch(() => null) as ScoreApiBody | null;
  return { response, body };
}

export async function recordScore(record: ScoreRecord): Promise<ScoreRecordResponse> {
  const primary = await postScore("/api/record-score", record);
  const primaryRank = primary.body?.rank;
  const primaryTotal = primary.body?.totalRecords;
  if (primary.response.ok && primary.body?.ok && Number.isInteger(primaryRank) && Number.isInteger(primaryTotal)) {
    return { rank: primaryRank as number, totalRecords: primaryTotal as number, topScores: parseTopScores(primary.body.topScores) };
  }

  // XServer has no Express route, so retain compatibility with the PHP/CSV deployment.
  if (primary.response.status === 404 || primary.body === null) {
    const fallback = await postScore("/api/record-score.php", record);
    const fallbackRank = fallback.body?.rank;
    const fallbackTotal = fallback.body?.totalRecords;
    if (fallback.response.ok && fallback.body?.ok && Number.isInteger(fallbackRank) && Number.isInteger(fallbackTotal)) {
      return { rank: fallbackRank as number, totalRecords: fallbackTotal as number, topScores: parseTopScores(fallback.body.topScores) };
    }
    throw new Error(fallback.body?.message ?? "結果を記録できませんでした。");
  }

  throw new Error(primary.body?.message ?? "結果を記録できませんでした。");
}
