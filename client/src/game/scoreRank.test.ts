import { describe, expect, it } from "vitest";
import { formatScoreRankRange, getScoreRank } from "./scoreRank";

describe("score rank bands", () => {
  it("13,000点前後をMASTERとして扱う", () => {
    expect(getScoreRank(12_499).label).toBe("EXPERT");
    expect(getScoreRank(12_500).label).toBe("MASTER");
    expect(getScoreRank(13_000).label).toBe("MASTER");
    expect(getScoreRank(14_999).label).toBe("MASTER");
  });

  it("18,000点からLEGENDになる", () => {
    expect(getScoreRank(17_999).label).toBe("ELITE");
    expect(getScoreRank(18_000).label).toBe("LEGEND");
    expect(formatScoreRankRange(getScoreRank(18_000))).toBe("18,000点以上");
  });

  it("すべての境界を連続して判定する", () => {
    expect([0, 2_500, 5_000, 7_500, 10_000, 12_500, 15_000, 18_000].map((score) => getScoreRank(score).label)).toEqual([
      "STARTER",
      "ROOKIE",
      "RUNNER",
      "ADVANCED",
      "EXPERT",
      "MASTER",
      "ELITE",
      "LEGEND",
    ]);
  });
});
