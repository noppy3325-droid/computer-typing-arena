/** Signal Lab design: lightweight synthesized instrument tones provide responsive feedback without external media files. */
export type SoundCue = "keypress" | "accepted" | "rejected";

export class AudioFeedback {
  private context: AudioContext | null = null;
  private enabled = true;

  unlock() {
    const context = this.getContext();
    if (context?.state === "suspended") void context.resume();
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) this.unlock();
    return this.enabled;
  }

  play(cue: SoundCue) {
    if (!this.enabled) return;
    this.unlock();
    const context = this.context;
    if (!context) return;

    if (cue === "keypress") {
      this.tone(context, 192, 0.026, 0.035, "triangle");
      return;
    }
    if (cue === "accepted") {
      this.tone(context, 523.25, 0.075, 0.07, "sine");
      this.tone(context, 783.99, 0.12, 0.052, "sine", 0.07);
      return;
    }
    this.tone(context, 122, 0.07, 0.052, "square");
  }

  dispose() {
    if (this.context && this.context.state !== "closed") void this.context.close();
    this.context = null;
  }

  private getContext() {
    if (this.context) return this.context;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return null;
    this.context = new AudioContextClass();
    return this.context;
  }

  private tone(context: AudioContext, frequency: number, duration: number, volume: number, type: OscillatorType, delay = 0) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = context.currentTime + delay;
    const endAt = startAt + duration;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.02);
  }
}
