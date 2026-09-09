export type ScoreRank = {
  id: "starter" | "rookie" | "runner" | "advanced" | "expert" | "master" | "elite" | "legend";
  label: string;
  min: number;
  max: number | null;
  description: string;
};

/**
 * 60秒プレイで13,000点前後が出る実測に合わせたスコア帯です。
 * 18,000点以上をLEGENDとし、通常の高得点者が全員LEGENDにならないようにします。
 */
export const SCORE_RANKS: readonly ScoreRank[] = [
  { id: "starter", label: "STARTER", min: 0, max: 2_499, description: "まずは操作に慣れる段階" },
  { id: "rookie", label: "ROOKIE", min: 2_500, max: 4_999, description: "基本操作を身につけた記録" },
  { id: "runner", label: "RUNNER", min: 5_000, max: 7_499, description: "安定して入力できる記録" },
  { id: "advanced", label: "ADVANCED", min: 7_500, max: 9_999, description: "速度と正確さが伸びた記録" },
  { id: "expert", label: "EXPERT", min: 10_000, max: 12_499, description: "上位を狙える実力" },
  { id: "master", label: "MASTER", min: 12_500, max: 14_999, description: "かなり速く正確な記録" },
  { id: "elite", label: "ELITE", min: 15_000, max: 17_999, description: "会場でも特に目立つ記録" },
  { id: "legend", label: "LEGEND", min: 18_000, max: null, description: "非常に高い最上位記録" },
] as const;

export function getScoreRank(score: number): ScoreRank {
  const normalizedScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  return [...SCORE_RANKS].reverse().find((rank) => normalizedScore >= rank.min) ?? SCORE_RANKS[0];
}

export function formatScoreRankRange(rank: ScoreRank): string {
  return rank.max === null
    ? `${rank.min.toLocaleString()}点以上`
    : `${rank.min.toLocaleString()}〜${rank.max.toLocaleString()}点`;
}
