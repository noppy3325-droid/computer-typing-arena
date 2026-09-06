import { describe, expect, it } from "vitest";
import { toScorePayload, type ScoreRecord } from "./scoreApi";

describe("score payload", () => {
  it("sends only the fields required by the ranking API", () => {
    const run = {
      playId: "play_1234567890",
      mode: "basic" as const,
      nickname: "ゲスト",
      score: 120,
      wpm: 24.5,
      accuracy: 98.2,
      completed: 8,
      bestStreak: 6,
      duration: 30,
      presentedTerms: Array.from({ length: 500 }, () => ({ longTrace: "x".repeat(100) })),
    } as ScoreRecord & { presentedTerms: unknown[] };

    const payload = toScorePayload(run);
    expect(payload).toEqual({
      playId: "play_1234567890",
      mode: "basic",
      nickname: "ゲスト",
      score: 120,
      wpm: 24.5,
      accuracy: 98.2,
      completed: 8,
      bestStreak: 6,
      duration: 30,
    });
    expect(JSON.stringify(payload)).not.toContain("presentedTerms");
  });
});
