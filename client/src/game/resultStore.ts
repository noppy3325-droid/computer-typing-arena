/** Signal Lab design: transient run data moves from the typing console to a dedicated results console without exposing it in the URL. */
import type { ScoreRecord } from "@/game/scoreApi";
import type { TechnicalTerm } from "@/game/terms";
import type { GameMode } from "@/game/gameModes";

const STORAGE_KEY = "computer-typing-arena.completed-run";

export type CompletedRun = ScoreRecord & {
  playId: string;
  typedCharacters: number;
  completedAt: string;
  presentedTerms: TechnicalTerm[];
};

function createPlayId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createCompletedRun(record: Omit<CompletedRun, "playId" | "completedAt">): CompletedRun {
  return { ...record, playId: createPlayId(), completedAt: new Date().toISOString() };
}

export function saveCompletedRun(run: CompletedRun) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(run));
}

export function loadCompletedRun(): CompletedRun | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CompletedRun>;
    if (
      typeof parsed.playId !== "string" || (parsed.mode !== "basic" && parsed.mode !== "hard") || typeof parsed.nickname !== "string" || typeof parsed.score !== "number" ||
      typeof parsed.wpm !== "number" || typeof parsed.accuracy !== "number" || typeof parsed.completed !== "number" ||
      typeof parsed.bestStreak !== "number" || typeof parsed.duration !== "number" || typeof parsed.typedCharacters !== "number" || !Array.isArray(parsed.presentedTerms)
    ) return null;
    return parsed as CompletedRun;
  } catch {
    return null;
  }
}

export function clearCompletedRun() {
  sessionStorage.removeItem(STORAGE_KEY);
}
