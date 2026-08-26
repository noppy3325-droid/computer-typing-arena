/** Signal Lab design: results are sent to the same-origin XServer PHP endpoint, keeping the CSV write outside the browser. */
export type ScoreRecord = {
  nickname: string;
  score: number;
  wpm: number;
  accuracy: number;
  completed: number;
  bestStreak: number;
  duration: number;
};

export async function recordScore(record: ScoreRecord) {
  const response = await fetch("/api/record-score.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });

  const body = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
  if (!response.ok || !body?.ok) {
    throw new Error(body?.message ?? "結果を記録できませんでした。");
  }
}
