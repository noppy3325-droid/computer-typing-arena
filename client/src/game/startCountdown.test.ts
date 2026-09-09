import { afterEach, describe, expect, it, vi } from "vitest";
import { PRE_START_COUNTDOWN_SECONDS, startGameCountdown } from "./startCountdown";

describe("startGameCountdown", () => {
  afterEach(() => vi.useRealTimers());

  it("3、2、1を順に通知して、3秒後に一度だけ開始する", () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const onComplete = vi.fn();

    startGameCountdown({ onTick, onComplete });
    expect(PRE_START_COUNTDOWN_SECONDS).toBe(3);
    expect(onTick).toHaveBeenCalledWith(3);

    vi.advanceTimersByTime(1_000);
    expect(onTick).toHaveBeenLastCalledWith(2);
    vi.advanceTimersByTime(1_000);
    expect(onTick).toHaveBeenLastCalledWith(1);
    vi.advanceTimersByTime(1_000);
    expect(onComplete).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("開始前に取り消すと開始処理を呼ばない", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const cancel = startGameCountdown({ onTick: vi.fn(), onComplete });
    cancel();
    vi.advanceTimersByTime(3_000);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
