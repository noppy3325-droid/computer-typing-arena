import React from "react";
import type { LeaderboardEntry } from "@/game/scoreApi";

type ResultLeaderboardProps = {
  modeLabel: string;
  entries: LeaderboardEntry[];
};

export function ResultLeaderboard({ modeLabel, entries }: ResultLeaderboardProps) {
  return (
    <section className="result-leaderboard" aria-labelledby="leaderboard-title">
      <div className="result-leaderboard-heading">
        <div>
          <p>LIVE RANKING</p>
          <h2 id="leaderboard-title">現在のトップ3</h2>
        </div>
        <span>{modeLabel}</span>
      </div>
      {entries.length ? (
        <ol className="result-leaderboard-list">
          {entries.map((entry, index) => (
            <li key={`${entry.rank}-${entry.nickname}-${entry.score}-${index}`}>
              <strong>#{entry.rank}</strong>
              <span>{entry.nickname}</span>
              <b>{entry.score.toLocaleString()}<small>点</small></b>
              <em>{Math.round(entry.wpm)} WPM</em>
            </li>
          ))}
        </ol>
      ) : <p className="result-leaderboard-empty">まだランキング記録がありません。</p>}
    </section>
  );
}
