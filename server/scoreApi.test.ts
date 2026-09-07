import { describe, expect, it } from "vitest";
import { calculateRanking, calculateTopScores, isSameHostOrigin, validateRecord } from "./scoreApi";

const validRecord = {
  playId: "play_1234567890",
  mode: "basic",
  nickname: "ゲスト",
  score: 120,
  wpm: 24.5,
  accuracy: 98.2,
  completed: 8,
  bestStreak: 6,
  duration: 60,
};

describe("Manus score API validation", () => {
  it("accepts a guest score in either supported mode", () => {
    expect(validateRecord(validRecord)).toMatchObject({ nickname: "ゲスト", mode: "basic" });
    expect(validateRecord({ ...validRecord, mode: "hard" })).toMatchObject({ mode: "hard" });
  });

  it("trims a nickname before persistence", () => {
    expect(validateRecord({ ...validRecord, nickname: "  Taro  " })?.nickname).toBe("Taro");
  });

  it("rejects malformed or unsafe score data", () => {
    expect(validateRecord({ ...validRecord, playId: "short" })).toBeNull();
    expect(validateRecord({ ...validRecord, nickname: "<script>" })).toBeNull();
    expect(validateRecord({ ...validRecord, mode: "other" })).toBeNull();
    expect(validateRecord({ ...validRecord, duration: 30 })).toBeNull();
    expect(validateRecord({ ...validRecord, accuracy: 101 })).toBeNull();
  });

  it("calculates separate rankings with competition-style ties", () => {
    const scores = [
      { mode: "basic" as const, score: 1000 },
      { mode: "basic" as const, score: 850 },
      { mode: "basic" as const, score: 850 },
      { mode: "basic" as const, score: 600 },
      { mode: "hard" as const, score: 9999 },
    ];
    expect(calculateRanking(scores, { mode: "basic", score: 850 })).toEqual({ rank: 2, totalRecords: 4 });
    expect(calculateRanking(scores, { mode: "hard", score: 5000 })).toEqual({ rank: 2, totalRecords: 1 });
  });

  it("returns the current top three with tied ranks and mode separation", () => {
    const scores = [
      { mode: "basic" as const, nickname: "高得点", score: 1000, wpm: 70 },
      { mode: "basic" as const, nickname: "同点A", score: 850, wpm: 55 },
      { mode: "basic" as const, nickname: "ゲスト", score: 850, wpm: 51 },
      { mode: "basic" as const, nickname: "四位", score: 600, wpm: 40 },
      { mode: "hard" as const, nickname: "ハード", score: 9999, wpm: 99 },
    ];
    expect(calculateTopScores(scores, "basic")).toEqual([
      { rank: 1, nickname: "高得点", score: 1000, wpm: 70 },
      { rank: 2, nickname: "同点A", score: 850, wpm: 55 },
      { rank: 2, nickname: "ゲスト", score: 850, wpm: 51 },
    ]);
    expect(calculateTopScores(scores, "hard")).toEqual([
      { rank: 1, nickname: "ハード", score: 9999, wpm: 99 },
    ]);
  });

  it("accepts browser requests from the same LAN or proxied host only", () => {
    expect(isSameHostOrigin("http://192.168.10.25:3000", "192.168.10.25:3000")).toBe(true);
    expect(isSameHostOrigin("https://typingarena-lf8xyyic.manus.space", "typingarena-lf8xyyic.manus.space")).toBe(true);
    expect(isSameHostOrigin("https://untrusted.example", "192.168.10.25:3000")).toBe(false);
    expect(isSameHostOrigin("not-a-url", "192.168.10.25:3000")).toBe(false);
  });
});
