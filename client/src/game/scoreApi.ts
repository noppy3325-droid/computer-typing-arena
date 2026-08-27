/** Signal Lab design: results are sent to the same-origin XServer PHP endpoint, keeping the CSV write outside the browser. */
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

export async function recordScore(record: ScoreRecord): Promise<ScoreRecordResponse> {
  const response = await fetch("/api/record-score.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });

  const body = await response.json().catch(() => null) as { ok?: boolean; message?: string; rank?: number; totalRecords?: number } | null;
  const rank = body?.rank;
  const totalRecords = body?.totalRecords;
  if (!response.ok || !body?.ok || !Number.isInteger(rank) || !Number.isInteger(totalRecords)) {
    throw new Error(body?.message ?? "結果を記録できませんでした。");
  }
  return { rank: rank as number, totalRecords: totalRecords as number };
}
