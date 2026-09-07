import { describe, expect, it } from "vitest";
import { BASIC_PROMPTS } from "./basicPrompts";
import { GAME_DURATION_SECONDS, TypingSession } from "./TypingSession";

describe("通常モードの出題設定", () => {
  it("250語以上の重複しない日常語を持ち、すべてローマ字入力候補を持つ", () => {
    expect(BASIC_PROMPTS.length).toBeGreaterThanOrEqual(250);
    expect(new Set(BASIC_PROMPTS.map((prompt) => prompt.term)).size).toBe(BASIC_PROMPTS.length);
    expect(BASIC_PROMPTS.every((prompt) => prompt.inputVariants?.length && prompt.description && prompt.label)).toBe(true);
  });

  it("計測時間を60秒に固定する", () => {
    const session = new TypingSession(BASIC_PROMPTS);
    expect(GAME_DURATION_SECONDS).toBe(60);
    expect(session.getSnapshot().duration).toBe(60);
    expect(session.getSnapshot().timeRemaining).toBe(60);
  });
});
