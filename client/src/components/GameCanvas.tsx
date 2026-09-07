/** Signal Lab design: a dark performance console with a central terminology channel and measurement rails, not a generic card grid. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Activity, CircleGauge, CornerDownLeft, Crosshair, Gauge, TimerReset, Volume2, VolumeX } from "lucide-react";
import { useLocation } from "wouter";
import { createGameScene, type GameHandle } from "@/game/scene";
import { TypingSession, type SessionSnapshot } from "@/game/TypingSession";
import { TECHNICAL_TERMS } from "@/game/terms";
import { BASIC_PROMPTS } from "@/game/basicPrompts";
import { GAME_MODES, type GameMode } from "@/game/gameModes";
import { AudioFeedback } from "@/game/AudioFeedback";
import { createCompletedRun, saveCompletedRun } from "@/game/resultStore";
import "./GameCanvas.css";

const CHAMBER_BACKGROUND = "/manus-storage/signal-lab-chamber-bg_6910abaf.png";
const PACKET_BURST = "/manus-storage/signal-packet-burst_4c103518.png";
const SIGNAL_GATE = "/manus-storage/signal-gate-logo_f663d1fc.png";
const DEMO_MODE = new URLSearchParams(window.location.search).has("demo");
const EMPTY_SNAPSHOT: SessionSnapshot = {
  status: "ready",
  current: BASIC_PROMPTS[0],
  duration: 60,
  timeRemaining: 60,
  score: 0,
  bestScore: 0,
  completed: 0,
  streak: 0,
  bestStreak: 0,
  correctKeys: 0,
  totalKeys: 0,
  accuracy: 100,
  wpm: 0,
  packetId: 0,
  lastPacket: "STANDBY",
};

function Metric({ label, value, suffix, emphasis = false }: { label: string; value: string | number; suffix?: string; emphasis?: boolean }) {
  return (
    <div className={`metric-readout ${emphasis ? "metric-readout-emphasis" : ""}`}>
      <span>{label}</span>
      <strong>{value}<small>{suffix}</small></strong>
    </div>
  );
}

function resolveInputVariant(term: string, inputVariants: string[] | undefined, typed: string) {
  const variants = inputVariants?.length ? inputVariants : [term];
  return variants.find((variant) => variant.startsWith(typed)) ?? variants[0];
}

function PromptCharacters({ term, inputVariants, label, typed, basic }: { term: string; inputVariants?: string[]; label: string; typed: string; basic: boolean }) {
  const displayedTerm = resolveInputVariant(term, inputVariants, typed);
  return (
    <span aria-label={`現在の出題語: ${label}。ローマ字入力: ${displayedTerm}`} className={`prompt-characters ${basic ? "prompt-characters-basic" : ""}`}>
      {basic && <span className="prompt-japanese">{label}</span>}
      <span className="prompt-romaji">
        {displayedTerm.split("").map((character, index) => {
          const typedCharacter = typed[index];
          const state = typedCharacter === undefined ? "pending" : typedCharacter === character ? "correct" : "wrong";
          return <span className={`prompt-letter prompt-letter-${state}`} key={`${character}-${index}`}>{character}</span>;
        })}
        {typed.length < displayedTerm.length && <span className="typing-cursor" aria-hidden="true" />}
      </span>
    </span>
  );
}

export default function GameCanvas() {
  const [, setLocation] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);
  const sessionRef = useRef<TypingSession | null>(null);
  const demoTimerRef = useRef<number | null>(null);
  const audioRef = useRef<AudioFeedback | null>(null);
  const typedRef = useRef("");
  const runIdRef = useRef(0);
  const completedRunIdRef = useRef(0);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(EMPTY_SNAPSHOT);
  const [typed, setTyped] = useState("");
  const [nickname, setNickname] = useState("");
  const [activeNickname, setActiveNickname] = useState("");
  const [nicknameError, setNicknameError] = useState("");
  const [shake, setShake] = useState(false);
  const [packetVisible, setPacketVisible] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [gameMode, setGameMode] = useState<GameMode>(DEMO_MODE ? "hard" : "basic");

  const secondsProgress = useMemo(() => Math.max(0, Math.min(100, (snapshot.timeRemaining / snapshot.duration) * 100)), [snapshot.duration, snapshot.timeRemaining]);
  const activeInputTerm = resolveInputVariant(snapshot.current.term, snapshot.current.inputVariants, typed);
  const isPlaying = snapshot.status === "running";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;
    startedRef.current = true;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: true });
    let handle: GameHandle | null = null;
    let active = true;
    createGameScene(engine, canvas)
      .then((gameHandle) => {
        if (!active) {
          gameHandle.dispose();
          return;
        }
        handle = gameHandle;
        engine.runRenderLoop(() => gameHandle.scene.render());
      })
      .catch((error) => console.error("Signal field could not initialize", error));
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    return () => {
      active = false;
      window.removeEventListener("resize", onResize);
      handle?.dispose();
      engine.dispose();
      startedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const session = new TypingSession(DEMO_MODE ? TECHNICAL_TERMS : BASIC_PROMPTS, { deterministic: DEMO_MODE });
    sessionRef.current = session;
    const unsubscribe = session.subscribe(setSnapshot);
    const unsubscribePacket = session.onPacket(() => {
      window.dispatchEvent(new Event("typing-packet"));
      setPacketVisible(true);
      window.setTimeout(() => setPacketVisible(false), 680);
    });

    if (DEMO_MODE) {
      session.start();
      demoTimerRef.current = window.setInterval(() => session.autoComplete(), 800);
    }

    return () => {
      unsubscribe();
      unsubscribePacket();
      if (demoTimerRef.current !== null) window.clearInterval(demoTimerRef.current);
      session.dispose();
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = new AudioFeedback();
    audioRef.current = audio;
    return () => {
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isPlaying && !DEMO_MODE) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [isPlaying, snapshot.current.term]);

  useEffect(() => {
    if (snapshot.status !== "finished" || !activeNickname || completedRunIdRef.current === runIdRef.current) return;
    completedRunIdRef.current = runIdRef.current;
    const presentedPrompts = sessionRef.current?.getPresentedPrompts() ?? [];
    saveCompletedRun(createCompletedRun({
      nickname: activeNickname,
      score: snapshot.score,
      wpm: snapshot.wpm,
      accuracy: snapshot.accuracy,
      completed: snapshot.completed,
      bestStreak: snapshot.bestStreak,
      duration: snapshot.duration,
      typedCharacters: snapshot.correctKeys,
      averageInputCharacters: snapshot.completed ? Math.round((snapshot.totalKeys / snapshot.completed) * 10) / 10 : 0,
      presentedTerms: presentedPrompts,
      mode: gameMode,
    }));
    setLocation("/glossary");
  }, [activeNickname, gameMode, setLocation, snapshot]);

  const normalizedNickname = () => nickname.trim().replace(/\s+/g, " ");
  const nicknameIsValid = (value: string) => Array.from(value).length >= 1 && Array.from(value).length <= 24 && !/[\r\n,]/.test(value);

  const startRun = () => {
    const normalized = normalizedNickname();
    if (!DEMO_MODE && normalized && !nicknameIsValid(normalized)) {
      setNicknameError("ニックネームを1〜24文字で入力してください。");
      return;
    }
    audioRef.current?.unlock();
    runIdRef.current += 1;
    setActiveNickname(DEMO_MODE ? "DEMO OPERATOR" : normalized || "ゲスト");
    setNickname(normalized);
    setNicknameError("");
    sessionRef.current?.setTerms(gameMode === "basic" ? BASIC_PROMPTS : TECHNICAL_TERMS);
    sessionRef.current?.start();
    typedRef.current = "";
    setTyped("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.isComposing || snapshot.status === "running") return;
      event.preventDefault();
      if (snapshot.status === "finished") return;
      startRun();
    };
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [snapshot.status]);

  const changeMode = (mode: GameMode) => {
    if (isPlaying) return;
    setGameMode(mode);
    setTyped("");
    typedRef.current = "";
    sessionRef.current?.setTerms(mode === "basic" ? BASIC_PROMPTS : TECHNICAL_TERMS);
  };

  const updateInput = (value: string) => {
    if (!isPlaying) return;
    const result = sessionRef.current?.type(value);
    if (!result) return;
    typedRef.current = result.typed;
    setTyped(result.typed);
    if (inputRef.current) inputRef.current.value = result.typed;
    if (result.accepted) {
      audioRef.current?.play("accepted");
    } else if (result.rejected) {
      audioRef.current?.play("rejected");
      setShake(true);
      window.setTimeout(() => setShake(false), 210);
    } else if (result.registeredKey) {
      audioRef.current?.play("keypress");
    }
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!isPlaying) startRun();
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      updateInput(`${typedRef.current}${event.key}`);
    }
  };

  const toggleSound = () => {
    const enabled = audioRef.current?.toggle() ?? false;
    setSoundOn(enabled);
  };

  return (
    <div className="signal-shell" style={{ backgroundImage: `linear-gradient(90deg, rgba(7, 28, 39, 0.94), rgba(7, 28, 39, 0.82), rgba(7, 28, 39, 0.94)), url(${CHAMBER_BACKGROUND})` }}>
      <canvas ref={canvasRef} className="signal-canvas" aria-hidden="true" />
      <div className="signal-noise" aria-hidden="true" />

      <header className="signal-header">
        <div className="brand-lockup">
          <img src={SIGNAL_GATE} alt="" className="brand-mark" />
          <div>
            <p className="eyebrow">コンピュータ用語タイピングゲーム</p>
            <h1>コンピュータ<span>用語</span>タイピング</h1>
          </div>
        </div>
        <div className="header-actions">
          <button type="button" className={`sound-toggle ${soundOn ? "sound-toggle-on" : ""}`} onClick={toggleSound} aria-label={soundOn ? "効果音をオフにする" : "効果音をオンにする"}>
            {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>効果音 {soundOn ? "オン" : "オフ"}</span>
          </button>
          <div className="header-status">
            <span className={isPlaying ? "status-led status-led-live" : "status-led"} />
            <span>{isPlaying ? "計測中" : snapshot.status === "finished" ? "計測完了" : "準備完了"}</span>
          </div>
        </div>
      </header>

      <main className={`signal-console ${isPlaying ? "" : "signal-console-ready"}`} aria-label="コンピュータ用語タイピングゲーム">
        {isPlaying && <aside className="signal-rail signal-rail-left" aria-label="スコア計器">
          <div className="rail-heading"><Activity size={14} /> 今回の記録</div>
          <Metric label="スコア" value={snapshot.score.toLocaleString()} suffix="点" emphasis />
          <Metric label="完了した出題" value={String(snapshot.completed)} suffix="個" />
          <Metric label="連続正解" value={`×${snapshot.streak}`} />
          <div className="rail-rule" />
          <div className="packet-log">
            <span>直前の判定</span>
            <strong>{snapshot.lastPacket === "STANDBY" ? "準備完了" : "正解を記録しました"}</strong>
          </div>
          <div className="rail-note">{gameMode === "basic" ? <>日常の言葉を<br />ローマ字で入力します</> : <>出題されるのは<br />コンピュータ用語だけです</>}</div>
        </aside>}

        <section className="typing-channel">
          <div className="channel-topline">
            <span><Crosshair size={13} /> {gameMode === "basic" ? "テーマ" : "出題カテゴリ"}：{snapshot.current.domainLabel}</span>
            <span>{GAME_MODES[gameMode].label} / 第 {snapshot.completed + 1} 問</span>
          </div>

          {snapshot.status === "ready" && (
            <div className="state-panel state-panel-ready">
              <p className="state-kicker">タイピング計測</p>
              <h2>{gameMode === "basic" ? <>日常のことばで、<br /><em>気軽に始めよう。</em></> : <>用語を打ち、<br /><em>処理能力</em>を測る。</>}</h2>
              <p>{GAME_MODES[gameMode].description} {gameMode === "basic" ? "表示される日本語を見て、下のローマ字を入力してください。" : "誤入力は自動で無視されるので、修正せずに次のキーを打てます。"}</p>
              <div className="typing-preview" aria-hidden="true">
                <span>入力イメージ</span>
                <strong>{gameMode === "basic" ? <><b>あさ</b><em>asa</em><i>_</i></> : <>network<i>_</i></>}</strong>
              </div>
              <div className={`nickname-stage ${nicknameError ? "nickname-stage-error" : ""}`}>
                <label htmlFor="operator-name">ニックネーム <span>任意</span></label>
                <input
                  id="operator-name"
                  value={nickname}
                  onChange={(event) => { setNickname(event.target.value); setNicknameError(""); }}
                  onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); startRun(); } }}
                  maxLength={24}
                  autoComplete="nickname"
                  placeholder="例：TARO"
                  aria-describedby={nicknameError ? "nickname-error" : undefined}
                  aria-invalid={Boolean(nicknameError)}
                />
                {nicknameError ? <small id="nickname-error">{nicknameError}</small> : <small>入力しない場合は「ゲスト」として表示されます</small>}
              </div>
              <div className="mode-selector" aria-label="ゲームモードを選択">
                {(Object.keys(GAME_MODES) as GameMode[]).map((mode) => (
                  <button key={mode} type="button" onClick={() => changeMode(mode)} className={gameMode === mode ? "mode-active" : ""}>
                    <strong>{GAME_MODES[mode].label}</strong><span>{GAME_MODES[mode].shortLabel}</span>
                  </button>
                ))}
              </div>
              <div className="duration-fixed" aria-label="計測時間は60秒固定です">
                <TimerReset size={16} />
                <span>計測時間</span>
                <strong>60秒固定</strong>
              </div>
              <button type="button" className="signal-button" onClick={startRun}>
                <CornerDownLeft size={17} /> 60秒計測を開始
              </button>
              <p className="key-hint">ニックネームなしでも、Enterキーですぐに開始できます</p>
            </div>
          )}


          {isPlaying && (
            <div className="active-run" onClick={() => inputRef.current?.focus()} role="presentation">
              <div className="word-stage">
                <p className="prompt-caption">{gameMode === "basic" ? "日本語を見て、ローマ字を入力" : "表示された用語を入力"}</p>
                <PromptCharacters term={snapshot.current.term} inputVariants={snapshot.current.inputVariants} label={snapshot.current.label} typed={typed} basic={gameMode === "basic"} />
                <img src={PACKET_BURST} alt="" className={`packet-burst ${packetVisible ? "packet-burst-visible" : ""}`} />
              </div>
              <div className={`input-stage ${shake ? "input-stage-shake" : ""}`}>
                <label htmlFor="typing-sensor">入力欄</label>
                <div className="input-readout" aria-hidden="true">{typed || "_"}</div>
                <input
                  ref={inputRef}
                  id="typing-sensor"
                  value={typed}
                  onChange={(event) => updateInput(event.target.value)}
                  onKeyDown={onInputKeyDown}
                  className="typing-sensor"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="text"
                  aria-label={gameMode === "basic" ? "表示された日本語のローマ字を入力" : "表示されたコンピュータ用語を入力"}
                />
                <span className="input-state">{typed.length} / {activeInputTerm.length} 文字</span>
              </div>
              <div className="live-footer">
                <span><span className="mini-led" /> 入力を判定中</span>
                <span>{gameMode === "basic" ? "ローマ字で入力・誤入力は自動で無視されます" : "誤入力は自動で無視されます"}</span>
              </div>
            </div>
          )}
        </section>

        {isPlaying && <aside className="signal-rail signal-rail-right" aria-label="パフォーマンス計器">
          <div className="rail-heading"><Gauge size={14} /> 現在の状況</div>
          <Metric label="入力速度" value={String(snapshot.wpm)} suffix=" WPM" emphasis />
          <Metric label="正確さ" value={snapshot.accuracy} suffix="%" />
          <Metric label="最大連続正解" value={`×${snapshot.bestStreak}`} />
          <div className="rail-rule" />
          <div className="time-module">
            <div><TimerReset size={15} /><span>残り時間</span></div>
            <strong>{String(snapshot.timeRemaining)}<small>秒</small></strong>
            <div className="time-track"><i style={{ width: `${secondsProgress}%` }} /></div>
          </div>
          <div className="time-module time-module-secondary">
            <div><CircleGauge size={15} /><span>自己ベスト</span></div>
            <strong>{snapshot.bestScore.toLocaleString()}<small>点</small></strong>
          </div>
        </aside>}
      </main>

      <footer className="signal-footer">
        <span>コンピュータ用語 タイピングゲーム</span>
        <span>見やすさ重視のデジタル計測画面 <i /></span>
      </footer>
    </div>
  );
}
