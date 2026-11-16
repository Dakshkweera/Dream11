/**
 * Turn-taking for a spoken conversation: decides, frame by frame, when the fan starts talking and when they
 * have finished. Pure and synchronous so it can be tested without a microphone.
 *
 * - The threshold adapts to the room: it tracks the background noise while nobody is talking.
 * - While the friend is speaking, some of its own voice can leak into the mic (no headphones). It tracks that
 *   leak separately and demands clearly louder, longer speech before treating it as the fan interrupting.
 * - A short pause emits "pause" so speech-to-text can start early; if the fan carries on, "resume" cancels it.
 *   A longer silence ends the turn. Very short blips (a cough, a click) are discarded, not sent.
 */
export type EndpointerOptions = {
  /** Speech this long (ms) starts a turn when the friend is quiet. */
  startMs: number;
  /** Speech this long (ms) counts as an interruption while the friend is speaking. */
  bargeInMs: number;
  /** Silence this long (ms) is a pause: a good moment to start transcribing early. */
  pauseMs: number;
  /** Silence this long (ms) ends the turn. */
  endSilenceMs: number;
  /** Turns with less speech than this (ms) are discarded. */
  minSpeechMs: number;
  /** A turn is cut off after this long (ms). */
  maxTurnMs: number;
  /** Never treat anything quieter than this RMS as speech. */
  minLevel: number;
};

export const DEFAULT_ENDPOINTER: EndpointerOptions = {
  startMs: 160,
  bargeInMs: 240,
  pauseMs: 300,
  endSilenceMs: 750,
  minSpeechMs: 320,
  maxTurnMs: 30_000,
  minLevel: 0.012,
};

export type EndpointEvent = "start" | "pause" | "resume" | "end" | "discard" | null;

export class Endpointer {
  private noise = 0.008;
  private echo = 0;
  private candidateMs = 0;
  private speaking = false;
  private paused = false;
  private turnMs = 0;
  private voicedMs = 0;
  private silenceMs = 0;

  constructor(private readonly o: EndpointerOptions = DEFAULT_ENDPOINTER) {}

  /** True while a turn is in progress (between "start" and "end"/"discard"). */
  get inTurn() {
    return this.speaking;
  }

  /** True when the turn so far has enough speech to be worth transcribing. */
  get worthSending() {
    return this.voicedMs >= this.o.minSpeechMs;
  }

  /** The level a frame must exceed to count as the fan's voice. */
  threshold(agentSpeaking: boolean): number {
    const base = Math.max(this.o.minLevel, this.noise * 3);
    return agentSpeaking ? Math.max(base * 1.8, this.echo * 2.4, this.o.minLevel * 2.5) : base;
  }

  /** Feed one frame: its RMS level, its length in ms, and whether the friend is talking right now. */
  push(level: number, frameMs: number, agentSpeaking: boolean): EndpointEvent {
    const thr = this.threshold(agentSpeaking);

    if (!this.speaking) {
      if (level > thr) {
        this.candidateMs += frameMs;
        if (this.candidateMs >= (agentSpeaking ? this.o.bargeInMs : this.o.startMs)) {
          this.speaking = true;
          this.paused = false;
          this.turnMs = this.candidateMs;
          this.voicedMs = this.candidateMs;
          this.silenceMs = 0;
          this.candidateMs = 0;
          return "start";
        }
      } else {
        // Forget slowly: the quiet gap between two syllables shouldn't reset the count.
        this.candidateMs = Math.max(0, this.candidateMs - frameMs / 2);
        // Learn the background: the room when the friend is quiet, its own voice leaking in when it talks.
        if (agentSpeaking) this.echo = this.echo * 0.95 + level * 0.05;
        else this.noise = this.noise * 0.97 + Math.min(level, 0.05) * 0.03;
      }
      return null;
    }

    // In a turn: hysteresis so a softer end of a word doesn't count as silence.
    this.turnMs += frameMs;
    if (level > thr * 0.6) {
      this.voicedMs += frameMs;
      this.silenceMs = 0;
      if (this.paused) {
        this.paused = false;
        return "resume";
      }
      if (this.turnMs < this.o.maxTurnMs) return null;
    } else {
      this.silenceMs += frameMs;
    }
    if (this.silenceMs >= this.o.endSilenceMs || this.turnMs >= this.o.maxTurnMs) {
      this.speaking = false;
      this.paused = false;
      this.candidateMs = 0;
      return this.voicedMs >= this.o.minSpeechMs ? "end" : "discard";
    }
    if (!this.paused && this.silenceMs >= this.o.pauseMs) {
      this.paused = true;
      return "pause";
    }
    return null;
  }

  /** Forget the current turn (used when the conversation is paused). */
  reset() {
    this.speaking = false;
    this.paused = false;
    this.candidateMs = 0;
    this.turnMs = this.voicedMs = this.silenceMs = 0;
  }
}

/** Root-mean-square level of a frame of samples (0 = silence, ~0.1+ = clear speech close to the mic). */
export function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / Math.max(1, frame.length));
}
