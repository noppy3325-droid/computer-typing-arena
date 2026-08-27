/** Signal Lab design: two clear lanes welcome first-time players while preserving a demanding technical challenge. */
export type GameMode = "basic" | "hard";

export const GAME_MODES: Record<GameMode, { label: string; shortLabel: string; description: string }> = {
  basic: { label: "基本モード", shortLabel: "日本語文", description: "パソコン用語が多い、やさしい日本語文を入力します。" },
  hard: { label: "ハードモード", shortLabel: "専門用語", description: "2,000語のコンピュータ専門用語に挑戦します。" },
};
