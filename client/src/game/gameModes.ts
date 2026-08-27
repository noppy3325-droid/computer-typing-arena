/** Signal Lab design: two clear lanes welcome first-time players while preserving a demanding technical challenge. */
export type GameMode = "basic" | "hard";

export const GAME_MODES: Record<GameMode, { label: string; shortLabel: string; description: string }> = {
  basic: { label: "基本モード", shortLabel: "日常語・ローマ字", description: "日常で使う短い日本語の単語を、ローマ字で入力します。" },
  hard: { label: "ハードモード", shortLabel: "専門用語", description: "2,000語のコンピュータ専門用語に挑戦します。" },
};
