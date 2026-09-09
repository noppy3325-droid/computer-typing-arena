export const PRE_START_COUNTDOWN_SECONDS = 3;

type CountdownCallbacks = {
  onTick: (remainingSeconds: number) => void;
  onComplete: () => void;
};

/** Starts a cancellable, exactly-once pre-game countdown. */
export function startGameCountdown({ onTick, onComplete }: CountdownCallbacks) {
  let remainingSeconds = PRE_START_COUNTDOWN_SECONDS;
  let finished = false;
  onTick(remainingSeconds);

  const timer = globalThis.setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds > 0) {
      onTick(remainingSeconds);
      return;
    }

    if (finished) return;
    finished = true;
    globalThis.clearInterval(timer);
    onComplete();
  }, 1_000);

  return () => {
    if (finished) return;
    finished = true;
    globalThis.clearInterval(timer);
  };
}
