/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResultPage from "./ResultPage";

const mocks = vi.hoisted(() => ({
  recordScore: vi.fn(),
  setLocation: vi.fn(),
}));

vi.mock("@/game/scoreApi", () => ({
  recordScore: mocks.recordScore,
}));

vi.mock("@/game/resultStore", () => ({
  loadCompletedRun: () => ({
    playId: "result_page_top_three_01",
    mode: "basic",
    nickname: "表示確認",
    score: 13_000,
    wpm: 31,
    accuracy: 98,
    completed: 5,
    bestStreak: 4,
    duration: 60,
    typedCharacters: 25,
    averageInputCharacters: 5,
    completedAt: "2026-09-07T00:00:00.000Z",
    presentedTerms: [],
  }),
  clearCompletedRun: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/result", mocks.setLocation],
}));

describe("ResultPageのトップ3表示", () => {
  beforeEach(() => {
    mocks.recordScore.mockReset();
    mocks.recordScore.mockResolvedValue({
      rank: 4,
      totalRecords: 4,
      topScores: [
        { rank: 1, nickname: "ALPHA", score: 1400, wpm: 72 },
        { rank: 2, nickname: "BRAVO", score: 1100, wpm: 60 },
        { rank: 2, nickname: "ゲスト", score: 1100, wpm: 58.4 },
      ],
    });
  });

  it("記録APIの応答を受けて、同点・ゲスト名を含むトップ3を結果画面に表示する", async () => {
    render(<ResultPage />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "現在のトップ3" })).toBeInTheDocument());

    expect(mocks.recordScore).toHaveBeenCalledWith(expect.objectContaining({ mode: "basic", duration: 60 }));
    expect(screen.getByText("ALPHA")).toBeInTheDocument();
    expect(screen.getByText("BRAVO")).toBeInTheDocument();
    expect(screen.getByText("ゲスト")).toBeInTheDocument();
    expect(screen.getByText("1,400", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText("#2")).toHaveLength(2);
    expect(screen.getByText("58 WPM")).toBeInTheDocument();
    expect(screen.getByLabelText("スコアランク MASTER")).toBeInTheDocument();
    expect(screen.getByText("12,500〜14,999点")).toBeInTheDocument();
    expect(screen.getByText(/記録が完了しました/)).toBeInTheDocument();
  });
});
