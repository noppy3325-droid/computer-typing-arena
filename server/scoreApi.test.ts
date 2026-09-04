import { describe, expect, it } from "vitest";
import { validateRecord } from "./scoreApi";

const validRecord = {
  playId: "play_1234567890",
  mode: "basic",
  nickname: "ゲスト",
  score: 120,
  wpm: 24.5,
  accuracy: 98.2,
  completed: 8,
  bestStreak: 6,
  duration: 30,
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
    expect(validateRecord({ ...validRecord, duration: 45 })).toBeNull();
    expect(validateRecord({ ...validRecord, accuracy: 101 })).toBeNull();
  });
});
