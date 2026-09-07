import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultLeaderboard } from "./ResultLeaderboard";

describe("ResultLeaderboard", () => {
  it("同点順位とゲスト名を含む現在のトップ3を描画する", () => {
    const markup = renderToStaticMarkup(
      <ResultLeaderboard
        modeLabel="基本モード"
        entries={[
          { rank: 1, nickname: "ALPHA", score: 1400, wpm: 72 },
          { rank: 2, nickname: "BRAVO", score: 1100, wpm: 60 },
          { rank: 2, nickname: "ゲスト", score: 1100, wpm: 58.4 },
        ]}
      />,
    );

    expect(markup).toContain("現在のトップ3");
    expect(markup).toContain("基本モード");
    expect(markup).toContain("#1");
    expect(markup).toContain("ALPHA");
    expect(markup).toContain("1,400");
    expect(markup).toContain("#2");
    expect(markup).toContain("ゲスト");
    expect(markup).toContain("58 WPM");
    expect((markup.match(/<li/g) ?? []).length).toBe(3);
  });

  it("記録がない場合は空状態を表示する", () => {
    const markup = renderToStaticMarkup(<ResultLeaderboard modeLabel="ハードモード" entries={[]} />);
    expect(markup).toContain("まだランキング記録がありません。");
  });
});
