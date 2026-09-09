/** Signal Lab design: framework-agnostic timing and scoring model for a precise typing instrument. */
import type { TechnicalTerm } from "./terms";

export type GameStatus = "ready" | "running" | "finished";

export type SessionSnapshot = {
  status: GameStatus;
  current: TechnicalTerm;
  duration: number;
  timeRemaining: number;
  score: number;
  bestScore: number;
  completed: number;
  streak: number;
  bestStreak: number;
  correctKeys: number;
  totalKeys: number;
  accuracy: number;
  wpm: number;
  packetId: number;
  lastPacket: string;
};

export type PacketListener = (term: TechnicalTerm, packetId: number) => void;

export type TypedCharacter = {
  character: string;
  correct: boolean;
};

export type PresentedPrompt = {
  term: TechnicalTerm;
  typedCharacters: TypedCharacter[];
};

export type TypingResult = {
  typed: string;
  accepted: boolean;
  rejected: boolean;
  registeredKey: boolean;
};

export const GAME_DURATION_SECONDS = 60;

export class TypingSession {
  private readonly listeners = new Set<(snapshot: SessionSnapshot) => void>();
  private readonly packetListeners = new Set<PacketListener>();
  private terms: TechnicalTerm[];
  private readonly deterministic: boolean;
  private sequence: TechnicalTerm[] = [];
  private presentedPrompts: PresentedPrompt[] = [];
  private timerId: ReturnType<typeof globalThis.setInterval> | null = null;
  private startedAt = 0;
  private sequenceIndex = 0;
  private typed = "";
  private status: GameStatus = "ready";
  private readonly duration = GAME_DURATION_SECONDS;
  private timeRemaining = GAME_DURATION_SECONDS;
  private score = 0;
  private bestScore = 0;
  private completed = 0;
  private streak = 0;
  private bestStreak = 0;
  private correctKeys = 0;
  private totalKeys = 0;
  private packetId = 0;
  private lastPacket = "STANDBY";
  private current: TechnicalTerm;

  constructor(terms: TechnicalTerm[], options?: { deterministic?: boolean }) {
    this.terms = terms;
    this.deterministic = options?.deterministic ?? false;
    this.current = terms[0];
  }

  subscribe(listener: (snapshot: SessionSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  onPacket(listener: PacketListener) {
    this.packetListeners.add(listener);
    return () => this.packetListeners.delete(listener);
  }

  getPresentedPrompts() {
    return this.presentedPrompts.map((prompt) => ({ ...prompt, typedCharacters: [...prompt.typedCharacters] }));
  }

  setTerms(terms: TechnicalTerm[]) {
    if (this.status === "running" || terms.length === 0) return;
    this.terms = terms;
    this.sequence = [];
    this.sequenceIndex = 0;
    this.presentedPrompts = [];
    this.typed = "";
    this.current = terms[0];
    this.emit();
  }

  getSnapshot(): SessionSnapshot {
    const elapsedSeconds = this.status === "running" ? Math.max(1, (Date.now() - this.startedAt) / 1000) : Math.max(1, this.duration - this.timeRemaining);
    return {
      status: this.status,
      current: this.current,
      duration: this.duration,
      timeRemaining: this.timeRemaining,
      score: this.score,
      bestScore: this.bestScore,
      completed: this.completed,
      streak: this.streak,
      bestStreak: this.bestStreak,
      correctKeys: this.correctKeys,
      totalKeys: this.totalKeys,
      accuracy: this.totalKeys === 0 ? 100 : Math.round((this.correctKeys / this.totalKeys) * 100),
      wpm: Math.round((this.correctKeys / 5 / elapsedSeconds) * 60),
      packetId: this.packetId,
      lastPacket: this.lastPacket,
    };
  }

  start() {
    if (this.status === "running") return;
    this.clearTimer();
    this.status = "running";
    this.timeRemaining = this.duration;
    this.score = 0;
    this.completed = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.correctKeys = 0;
    this.totalKeys = 0;
    this.typed = "";
    this.presentedPrompts = [];
    this.sequenceIndex = 0;
    this.sequence = this.deterministic ? [...this.terms] : this.createBalancedSequence();
    this.lastPacket = "CHANNEL OPEN";
    this.current = this.pickNext();
    this.presentedPrompts.push({ term: this.current, typedCharacters: [] });
    this.startedAt = Date.now();
    this.timerId = globalThis.setInterval(() => this.tick(), 100);
    this.emit();
  }

  restart() {
    this.start();
  }

  resetToReady() {
    this.clearTimer();
    this.status = "ready";
    this.timeRemaining = this.duration;
    this.typed = "";
    this.lastPacket = "STANDBY";
    this.emit();
  }

  type(value: string): TypingResult {
    if (this.status !== "running") return { typed: this.typed, accepted: false, rejected: false, registeredKey: false };
    const variants = this.getInputVariants(this.current);
    const normalized = this.normalize(value).slice(0, Math.max(...variants.map((variant) => variant.length)));
    const previous = this.typed;
    if (normalized.length <= previous.length) {
      this.emit();
      return { typed: this.typed, accepted: false, rejected: false, registeredKey: false };
    }

    let accepted = false;
    let rejected = false;
    let registeredKey = false;
    const incomingCharacters = normalized.slice(previous.length);

    for (const character of incomingCharacters) {
      this.totalKeys += 1;
      const nextInput = `${this.typed}${character}`;
      const isValidPrefix = variants.some((variant) => variant.startsWith(nextInput));
      this.currentPrompt()?.typedCharacters.push({ character, correct: isValidPrefix });
      if (!isValidPrefix) {
        rejected = true;
        continue;
      }

      this.correctKeys += 1;
      this.typed += character;
      registeredKey = true;
      if (variants.includes(this.typed)) {
        this.acceptCurrent();
        accepted = true;
        break;
      }
    }

    if (!accepted) this.emit();
    return { typed: this.typed, accepted, rejected, registeredKey };
  }

  autoComplete() {
    if (this.status !== "running") return;
    const target = this.getInputVariants(this.current)[0];
    this.totalKeys += target.length;
    this.correctKeys += target.length;
    this.typed = target;
    const currentPrompt = this.currentPrompt();
    if (currentPrompt) currentPrompt.typedCharacters.push(...target.split("").map((character) => ({ character, correct: true })));
    this.acceptCurrent();
  }

  dispose() {
    this.clearTimer();
    this.listeners.clear();
    this.packetListeners.clear();
  }

  private tick() {
    const elapsed = (Date.now() - this.startedAt) / 1000;
    this.timeRemaining = Math.max(0, Math.ceil(this.duration - elapsed));
    if (this.timeRemaining <= 0) {
      this.status = "finished";
      this.bestScore = Math.max(this.bestScore, this.score);
      this.lastPacket = "WINDOW CLOSED";
      this.clearTimer();
    }
    this.emit();
  }

  private acceptCurrent() {
    const accepted = this.current;
    const reward = 100 + Math.min(300, this.streak * 12) + Math.max(0, accepted.term.length - 5) * 8;
    this.score += reward;
    this.completed += 1;
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.packetId += 1;
    this.lastPacket = `${accepted.domain} PACKET ACCEPTED`;
    this.typed = "";
    this.current = this.pickNext();
    this.presentedPrompts.push({ term: this.current, typedCharacters: [] });
    this.packetListeners.forEach((listener) => listener(accepted, this.packetId));
    this.emit();
  }

  private pickNext() {
    const terms = this.sequence.length ? this.sequence : this.terms;
    const next = terms[this.sequenceIndex % terms.length];
    this.sequenceIndex += 1;
    return next;
  }

  private createBalancedSequence() {
    const grouped = new Map<string, TechnicalTerm[]>();
    for (const term of this.terms) {
      const group = grouped.get(term.domain) ?? [];
      group.push(term);
      grouped.set(term.domain, group);
    }
    const queues: TechnicalTerm[][] = Array.from(grouped.values()).map((terms) => this.shuffle(terms));
    const sequence: TechnicalTerm[] = [];
    while (queues.some((terms) => terms.length > 0)) {
      const activeQueues = queues.filter((terms) => terms.length > 0);
      for (const terms of this.shuffle<TechnicalTerm[]>(activeQueues)) {
        const next = terms.pop();
        if (next) sequence.push(next);
      }
    }
    return sequence;
  }

  private shuffle<T>(items: T[]) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  private normalize(value: string) {
    return value.normalize("NFKC").toLowerCase().replace(/[ーｰ−―]/g, "-").replace(/\s/g, "");
  }

  private getInputVariants(term: TechnicalTerm) {
    const variants = term.inputVariants?.length ? term.inputVariants : [term.term];
    return variants.map((variant) => this.normalize(variant));
  }

  private currentPrompt() {
    return this.presentedPrompts[this.presentedPrompts.length - 1];
  }

  private emit() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private clearTimer() {
    if (this.timerId !== null) globalThis.clearInterval(this.timerId);
    this.timerId = null;
  }
}
