/** Signal Lab design: an approachable study terminal turns each festival round into a short learning moment before revealing the score. */
import { BookOpenText, CircleAlert, ChevronRight, CircleCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { clearCompletedRun, loadCompletedRun } from "@/game/resultStore";
import { GAME_MODES } from "@/game/gameModes";
import "./GlossaryPage.css";

const SIGNAL_GATE = "/manus-storage/signal-gate-logo_f663d1fc.png";
const CHAMBER_BACKGROUND = "/manus-storage/signal-lab-chamber-bg_6910abaf.png";

export default function GlossaryPage() {
  const [, setLocation] = useLocation();
  const [run] = useState(loadCompletedRun);
  const returnToGame = () => {
    clearCompletedRun();
    setLocation("/");
  };

  if (!run) {
    return (
      <main className="glossary-shell glossary-shell-empty">
        <div className="glossary-missing"><CircleAlert size={34} /><h1>出題履歴が見つかりません</h1><p>はじめから計測を開始してください。</p><button type="button" className="glossary-next-button" onClick={returnToGame}>ゲーム画面へ戻る</button></div>
      </main>
    );
  }

  return (
    <main className="glossary-shell" style={{ backgroundImage: `linear-gradient(90deg, rgba(7, 28, 39, 0.96), rgba(7, 28, 39, 0.84), rgba(7, 28, 39, 0.96)), url(${CHAMBER_BACKGROUND})` }}>
      <div className="glossary-noise" aria-hidden="true" />
      <header className="glossary-header"><div className="glossary-brand"><img src={SIGNAL_GATE} alt="" /><span>コンピュータ用語タイピング</span></div><span>{GAME_MODES[run.mode].label}の振り返り</span></header>
      <section className="glossary-console" aria-labelledby="glossary-title">
        <div className="glossary-intro"><p><BookOpenText size={16} /> {run.mode === "basic" ? "今回入力した日常語" : "今日の用語メモ"}</p><h1>今回出題された<br /><em>{run.presentedTerms.length}{run.mode === "basic" ? "個の単語" : "個の用語"}</em></h1><span>{run.mode === "basic" ? "日本語の表示語とローマ字を振り返ってから、結果とランキングを見ましょう。" : "入力した用語の意味を確認してから、結果とランキングを見ましょう。"}</span></div>
        {run.presentedTerms.length > 0 ? <ol className="term-notes">{run.presentedTerms.map((term, index) => <li key={`${term.term}-${index}`}><span className="term-note-number">{String(index + 1).padStart(2, "0")}</span><div><div className="term-note-heading"><strong>{term.label}</strong><small>{term.domainLabel}</small></div><p>{term.description}</p>{term.sourceUrl && <a href={term.sourceUrl} target="_blank" rel="noreferrer">出典を確認</a>}</div><CircleCheck size={19} aria-hidden="true" /></li>)}</ol> : <div className="term-notes-empty">今回は完了した出題がありません。次のプレイで挑戦してみましょう。</div>}
        <div className="glossary-next"><button type="button" className="glossary-next-button" onClick={() => setLocation("/result")}><ChevronRight size={21} /> 結果とランキングを見る</button><p>この画面を開いている間は、まだ記録されません。</p></div>
      </section>
    </main>
  );
}
