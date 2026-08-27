/** Signal Lab design: a bright, high-contrast scoreboard makes completion unmistakable for the next festival player in line. */
import { useEffect, useState } from "react";
import { BarChart3, CircleAlert, Keyboard, LoaderCircle, RotateCcw, Trophy } from "lucide-react";
import { useLocation } from "wouter";
import { recordScore, type ScoreRecordResponse } from "@/game/scoreApi";
import { clearCompletedRun, loadCompletedRun } from "@/game/resultStore";
import { GAME_MODES } from "@/game/gameModes";

const SIGNAL_GATE = "/manus-storage/signal-gate-logo_f663d1fc.png";
const CHAMBER_BACKGROUND = "/manus-storage/signal-lab-chamber-bg_6910abaf.png";

export default function ResultPage() {
  const [, setLocation] = useLocation();
  const [run] = useState(loadCompletedRun);
  const [recordState, setRecordState] = useState<"sending" | "saved" | "failed">("sending");
  const [ranking, setRanking] = useState<ScoreRecordResponse | null>(null);

  const startNextPlayer = () => {
    clearCompletedRun();
    setLocation("/");
  };

  useEffect(() => {
    if (!run) return;
    let active = true;
    void recordScore(run)
      .then((result) => {
        if (!active) return;
        setRanking(result);
        setRecordState("saved");
      })
      .catch(() => {
        if (active) setRecordState("failed");
      });
    return () => { active = false; };
  }, [run]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      startNextPlayer();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!run) {
    return (
      <main className="result-shell result-shell-empty">
        <div className="result-missing">
          <CircleAlert size={34} />
          <h1>結果が見つかりません</h1>
          <p>はじめから計測を開始してください。</p>
          <button type="button" className="result-next-button" onClick={startNextPlayer}>ゲーム画面へ戻る</button>
        </div>
      </main>
    );
  }

  return (
    <main className="result-shell" style={{ backgroundImage: `linear-gradient(90deg, rgba(7, 28, 39, 0.96), rgba(7, 28, 39, 0.84), rgba(7, 28, 39, 0.96)), url(${CHAMBER_BACKGROUND})` }}>
      <div className="result-noise" aria-hidden="true" />
      <header className="result-header">
        <div className="result-brand">
          <img src={SIGNAL_GATE} alt="" />
          <span>コンピュータ用語タイピング</span>
        </div>
        <span className="result-header-status">{GAME_MODES[run.mode].label} / 計測完了</span>
      </header>

      <section className="results-console" aria-labelledby="result-title">
        <div className="results-title-block">
          <p>{GAME_MODES[run.mode].label}の計測結果</p>
          <h1 id="result-title"><em>{run.nickname}</em> さんの結果</h1>
          <span>おつかれさまでした。今回の計測結果です。</span>
        </div>

        <div className="results-primary-grid">
          <article className="result-score-panel">
            <span>スコア</span>
            <strong>{run.score.toLocaleString()}<small>点</small></strong>
          </article>
          <article className="result-rank-panel" aria-live="polite">
            <span>ランキング順位</span>
            {recordState === "saved" && ranking ? (
              <strong>第 <b>{ranking.rank}</b> 位</strong>
            ) : (
              <strong className="rank-pending"><LoaderCircle size={30} /> 集計中</strong>
            )}
            <small>{recordState === "saved" && ranking ? `${GAME_MODES[run.mode].label}の全 ${ranking.totalRecords} 記録中・同点は同順位` : "記録と順位を計算しています"}</small>
          </article>
        </div>

        <div className="result-stat-row">
          <article><Keyboard size={20} /><span>入力文字数</span><strong>{run.typedCharacters}<small>文字</small></strong></article>
          <article><BarChart3 size={20} /><span>入力速度</span><strong>{run.wpm}<small>WPM</small></strong></article>
          <article><Trophy size={20} /><span>正確さ</span><strong>{run.accuracy}<small>%</small></strong></article>
        </div>

        <div className={`result-record-status result-record-status-${recordState}`} aria-live="polite">
          {recordState === "sending" && <><LoaderCircle size={18} /> 結果を記録しています…</>}
          {recordState === "saved" && <>記録が完了しました。次の人に交代できます。</>}
          {recordState === "failed" && <><CircleAlert size={18} /> 結果の記録に失敗しました。サーバー設定を確認してください。</>}
        </div>

        <button type="button" className="result-next-button" onClick={startNextPlayer}>
          <RotateCcw size={20} /> 次の人がプレイする
        </button>
        <p className="result-key-hint">Enterキーでも次のプレイを開始できます</p>
      </section>
    </main>
  );
}
