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
};

type ScoreApiBody = { ok?: boolean; message?: string; rank?: number; totalRecords?: number };

async function postScore(endpoint: string, record: ScoreRecord) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  const body = await response.json().catch(() => null) as ScoreApiBody | null;
  return { response, body };
}

export async function recordScore(record: ScoreRecord): Promise<ScoreRecordResponse> {
  const primary = await postScore("/api/record-score", record);
  const primaryRank = primary.body?.rank;
  const primaryTotal = primary.body?.totalRecords;
  if (primary.response.ok && primary.body?.ok && Number.isInteger(primaryRank) && Number.isInteger(primaryTotal)) {
    return { rank: primaryRank as number, totalRecords: primaryTotal as number };
  }

  // XServer has no Express route, so retain compatibility with the PHP/CSV deployment.
  if (primary.response.status === 404 || primary.body === null) {
    const fallback = await postScore("/api/record-score.php", record);
    const fallbackRank = fallback.body?.rank;
    const fallbackTotal = fallback.body?.totalRecords;
    if (fallback.response.ok && fallback.body?.ok && Number.isInteger(fallbackRank) && Number.isInteger(fallbackTotal)) {
      return { rank: fallbackRank as number, totalRecords: fallbackTotal as number };
    }
    throw new Error(fallback.body?.message ?? "結果を記録できませんでした。");
  }

  throw new Error(primary.body?.message ?? "結果を記録できませんでした。");
}
