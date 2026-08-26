/** Signal Lab design: a dark performance console with a central terminology channel and measurement rails, not a generic card grid. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Activity, CircleGauge, CornerDownLeft, Crosshair, Gauge, RotateCcw, TimerReset } from "lucide-react";
import { createGameScene, type GameHandle } from "@/game/scene";
import { TypingSession, type SessionSnapshot } from "@/game/TypingSession";
import { TECHNICAL_TERMS } from "@/game/terms";

const CHAMBER_BACKGROUND = "/manus-storage/signal-lab-chamber-bg_6910abaf.png";
const PACKET_BURST = "/manus-storage/signal-packet-burst_4c103518.png";
const SIGNAL_GATE = "/manus-storage/signal-gate-logo_f663d1fc.png";
const DEMO_MODE = new URLSearchParams(window.location.search).has("demo");

const EMPTY_SNAPSHOT: SessionSnapshot = {
  status: "ready",
  current: TECHNICAL_TERMS[0],
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

function PromptCharacters({ term, typed }: { term: string; typed: string }) {
  return (
    <span aria-label={`現在の出題語: ${term}`} className="prompt-characters">
      {term.split("").map((character, index) => {
        const typedCharacter = typed[index];
        const state = typedCharacter === undefined ? "pending" : typedCharacter === character ? "correct" : "wrong";
        return <span className={`prompt-letter prompt-letter-${state}`} key={`${character}-${index}`}>{character}</span>;
      })}
      {typed.length < term.length && <span className="typing-cursor" aria-hidden="true" />}
    </span>
  );
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);
  const sessionRef = useRef<TypingSession | null>(null);
  const demoTimerRef = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(EMPTY_SNAPSHOT);
  const [typed, setTyped] = useState("");
  const [shake, setShake] = useState(false);
  const [packetVisible, setPacketVisible] = useState(false);

  const secondsProgress = useMemo(() => Math.max(0, Math.min(100, (snapshot.timeRemaining / snapshot.duration) * 100)), [snapshot.duration, snapshot.timeRemaining]);
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
    const session = new TypingSession(TECHNICAL_TERMS, { deterministic: DEMO_MODE });
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
    if (isPlaying && !DEMO_MODE) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [isPlaying, snapshot.current.term]);

  useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.isComposing || snapshot.status === "running") return;
      event.preventDefault();
      sessionRef.current?.start();
      setTyped("");
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [snapshot.status]);

  const startRun = () => {
    sessionRef.current?.start();
    setTyped("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const changeDuration = (seconds: number) => {
    sessionRef.current?.setDuration(seconds);
    setTyped("");
  };

  const onInputChange = (value: string) => {
    if (!isPlaying) return;
    const completed = sessionRef.current?.type(value) ?? false;
    const upcoming = sessionRef.current?.getSnapshot().current.term;
    setTyped(completed ? "" : value.toLowerCase().replace(/\s/g, "").slice(0, upcoming?.length ?? 99));
    if (value.length > 0 && value[value.length - 1] !== snapshot.current.term[Math.min(value.length - 1, snapshot.current.term.length - 1)]) {
      setShake(true);
      window.setTimeout(() => setShake(false), 210);
    }
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!isPlaying) startRun();
    }
  };

  return (
    <div className="signal-shell" style={{ backgroundImage: `linear-gradient(90deg, rgba(3, 12, 20, 0.94), rgba(3, 12, 20, 0.72), rgba(3, 12, 20, 0.94)), url(${CHAMBER_BACKGROUND})` }}>
      <canvas ref={canvasRef} className="signal-canvas" aria-hidden="true" />
      <div className="signal-noise" aria-hidden="true" />

      <header className="signal-header">
        <div className="brand-lockup">
          <img src={SIGNAL_GATE} alt="" className="brand-mark" />
          <div>
            <p className="eyebrow">SYSTEM PERFORMANCE LAB</p>
            <h1>COMPUTER<span> TYPING</span> ARENA</h1>
          </div>
        </div>
        <div className="header-status">
          <span className={isPlaying ? "status-led status-led-live" : "status-led"} />
          <span>{isPlaying ? "CHANNEL LIVE" : snapshot.status === "finished" ? "RUN ARCHIVED" : "CHANNEL READY"}</span>
        </div>
      </header>

      <main className="signal-console" aria-label="コンピュータ用語タイピングゲーム">
        <aside className="signal-rail signal-rail-left" aria-label="スコア計器">
          <div className="rail-heading"><Activity size={14} /> SESSION</div>
          <Metric label="SCORE" value={snapshot.score.toLocaleString()} emphasis />
          <Metric label="COMPLETED" value={String(snapshot.completed).padStart(2, "0")} suffix=" TERMS" />
          <Metric label="STREAK" value={`×${snapshot.streak}`} />
          <div className="rail-rule" />
          <div className="packet-log">
            <span>LAST EVENT</span>
            <strong>{snapshot.lastPacket}</strong>
          </div>
          <div className="rail-note">ONLY COMPUTER<br />TERMS ON CHANNEL</div>
        </aside>

        <section className="typing-channel">
          <div className="channel-topline">
            <span><Crosshair size={13} /> TERM STREAM / {snapshot.current.domain}</span>
            <span>SECTOR {String((snapshot.completed % 9) + 1).padStart(2, "0")}</span>
          </div>

          {snapshot.status === "ready" && (
            <div className="state-panel state-panel-ready">
              <p className="state-kicker">TERMINOLOGY CHANNEL</p>
              <h2>用語を打ち、<br /><em>処理能力</em>を測る。</h2>
              <p>出題されるのは、ネットワーク・開発・OS・ハードウェアなどのコンピュータ関連用語だけです。</p>
              <div className="duration-selector" aria-label="制限時間を選択">
                {[30, 60, 90].map((seconds) => (
                  <button key={seconds} type="button" onClick={() => changeDuration(seconds)} className={snapshot.duration === seconds ? "duration-active" : ""}>{seconds}S</button>
                ))}
              </div>
              <button type="button" className="signal-button" onClick={startRun}>
                <CornerDownLeft size={17} /> {snapshot.duration}秒計測を開始
              </button>
              <p className="key-hint">ENTER でも開始できます</p>
            </div>
          )}

          {snapshot.status === "finished" && (
            <div className="state-panel state-panel-finish">
              <p className="state-kicker">MEASUREMENT COMPLETE</p>
              <h2>{snapshot.score.toLocaleString()}<small> PTS</small></h2>
              <div className="finish-metrics">
                <span><b>{snapshot.wpm}</b> WPM</span>
                <span><b>{snapshot.accuracy}%</b> ACCURACY</span>
                <span><b>×{snapshot.bestStreak}</b> BEST STREAK</span>
              </div>
              <p>今回の最高スコア: {snapshot.bestScore.toLocaleString()} PTS</p>
              <button type="button" className="signal-button" onClick={startRun}>
                <RotateCcw size={17} /> 同じ条件で再計測
              </button>
            </div>
          )}

          {isPlaying && (
            <div className="active-run" onClick={() => inputRef.current?.focus()} role="presentation">
              <div className="word-stage">
                <p className="prompt-caption">TYPE THE INCOMING TERM</p>
                <PromptCharacters term={snapshot.current.term} typed={typed} />
                <img src={PACKET_BURST} alt="" className={`packet-burst ${packetVisible ? "packet-burst-visible" : ""}`} />
              </div>
              <div className={`input-stage ${shake ? "input-stage-shake" : ""}`}>
                <label htmlFor="typing-sensor">INPUT BUFFER</label>
                <div className="input-readout" aria-hidden="true">{typed || "_"}</div>
                <input
                  ref={inputRef}
                  id="typing-sensor"
                  value={typed}
                  onChange={(event) => onInputChange(event.target.value)}
                  onKeyDown={onInputKeyDown}
                  className="typing-sensor"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  inputMode="text"
                  aria-label="表示されたコンピュータ用語を入力"
                />
                <span className="input-state">{typed.length}/{snapshot.current.term.length} CHARACTERS</span>
              </div>
              <div className="live-footer">
                <span><span className="mini-led" /> ANALYZING KEYSTROKES</span>
                <span>PRESS BACKSPACE TO CORRECT</span>
              </div>
            </div>
          )}
        </section>

        <aside className="signal-rail signal-rail-right" aria-label="パフォーマンス計器">
          <div className="rail-heading"><Gauge size={14} /> TELEMETRY</div>
          <Metric label="WPM" value={String(snapshot.wpm).padStart(2, "0")} emphasis />
          <Metric label="ACCURACY" value={snapshot.accuracy} suffix="%" />
          <Metric label="BEST STREAK" value={`×${snapshot.bestStreak}`} />
          <div className="rail-rule" />
          <div className="time-module">
            <div><TimerReset size={15} /><span>TIME WINDOW</span></div>
            <strong>{String(snapshot.timeRemaining).padStart(2, "0")}<small>S</small></strong>
            <div className="time-track"><i style={{ width: `${secondsProgress}%` }} /></div>
          </div>
          <div className="time-module time-module-secondary">
            <div><CircleGauge size={15} /><span>BEST SCORE</span></div>
            <strong>{snapshot.bestScore.toLocaleString()}<small>PTS</small></strong>
          </div>
        </aside>
      </main>

      <footer className="signal-footer">
        <span>V1.0 / LATENCY-NEUTRAL / EN-US INPUT</span>
        <span>PHOSPHOR MINT SIGNAL SYSTEM <i /></span>
      </footer>
    </div>
  );
}
