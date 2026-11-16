/**
 * Plays the friend's voice one piece at a time.
 * - The next couple of pieces are requested while the current one plays, so there are no gaps.
 * - Where the browser allows it, a piece starts playing while its audio is still downloading.
 * - stop() silences it at once and throws away everything queued: that is what makes interrupting feel natural.
 * - react() plays a short pre-fetched reaction ("Hmm, achha…") the instant the fan stops talking, so a slower
 *   voice never leaves an awkward silence while the real answer is prepared.
 */
import { browserSpeak } from "@/lib/client";

type Item = { text: string; res: Promise<Response | null> | null; ctrl: AbortController };
export type SpeakerListener = (speaking: boolean) => void;

const MAX_PREFETCH = 2;
const canStream = (type: string | null) =>
  !!type?.includes("mpeg") && typeof MediaSource !== "undefined" && MediaSource.isTypeSupported("audio/mpeg");

/** Quick, neutral reactions: they fit any question, because the answer isn't known yet. */
export const REACTIONS = ["Hmm, achha…", "Ooh, good one!", "Arre haan!", "Achha, sun…", "Haan haan, okay…", "Oh nice, okay…"];

export class Speaker {
  private queue: Item[] = [];
  private current: HTMLAudioElement | null = null;
  private running = false;
  private generation = 0;
  private listeners = new Set<SpeakerListener>();
  private _speaking = false;
  private reactions: Blob[] = [];
  private preloading = false;
  private lastReaction = -1;

  get speaking() {
    return this._speaking;
  }

  onChange(fn: SpeakerListener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private set(v: boolean) {
    if (this._speaking === v) return;
    this._speaking = v;
    this.listeners.forEach((fn) => fn(v));
  }

  private request(item: Item): Promise<Response | null> {
    const once = () =>
      fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text.slice(0, 1200) }),
        signal: item.ctrl.signal,
      })
        .then((r) => (r.ok && r.body ? r : null))
        .catch(() => null);
    // A busy moment shouldn't switch voices mid-reply: retry once before falling back to the browser's voice.
    item.res ??= once().then(async (r) => {
      if (r || item.ctrl.signal.aborted) return r;
      await new Promise((ok) => setTimeout(ok, 1200));
      return item.ctrl.signal.aborted ? null : once();
    });
    return item.res;
  }

  /** Fetch the reaction clips once, in the current voice, so they can play with no delay. */
  preloadReactions(lines: string[] = REACTIONS) {
    if (this.reactions.length || this.preloading) return;
    this.preloading = true;
    // One at a time: a smaller OpenRouter balance limits how many requests can run at once.
    void (async () => {
      for (const text of lines) {
        const blob = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
          .then((r) => (r.ok ? r.blob() : null))
          .catch(() => null);
        if (blob?.size) this.reactions.push(blob);
      }
      this.preloading = false;
    })();
  }

  /** React out loud right away (a different reaction each time), ahead of the real answer. */
  react() {
    if (!this.reactions.length || this._speaking) return;
    let i = Math.floor(Math.random() * this.reactions.length);
    if (i === this.lastReaction) i = (i + 1) % this.reactions.length;
    this.lastReaction = i;
    const blob = this.reactions[i];
    const item: Item = { text: "", res: Promise.resolve(new Response(blob, { headers: { "Content-Type": blob.type } })), ctrl: new AbortController() };
    this.queue.unshift(item);
    this.set(true);
    if (!this.running) void this.run();
  }

  /** Queue a piece of speech. */
  say(text: string) {
    if (!text.trim()) return;
    const item: Item = { text, res: null, ctrl: new AbortController() };
    if (this.queue.length < MAX_PREFETCH) void this.request(item);
    this.queue.push(item);
    this.set(true);
    if (!this.running) void this.run();
  }

  private async run() {
    this.running = true;
    const gen = this.generation;
    while (this.queue.length && gen === this.generation) {
      const item = this.queue.shift()!;
      for (const next of this.queue.slice(0, MAX_PREFETCH)) void this.request(next);
      const res = await this.request(item);
      if (gen !== this.generation) break;
      if (!res) await this.fallback(item.text, gen);
      else await (canStream(res.headers.get("content-type")) ? this.playStreaming(res, gen) : this.playWhole(res, gen));
    }
    if (gen === this.generation) {
      this.running = false;
      this.set(false);
    }
  }

  /** Wire up an audio element and resolve when it finishes, fails, or is stopped. */
  private watch(audio: HTMLAudioElement, cleanup: () => void): Promise<void> {
    return new Promise((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        cleanup();
        if (this.current === audio) this.current = null;
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.addEventListener("pause", () => {
        if (!audio.ended) done(); // stop() pauses
      });
      this.current = audio;
    });
  }

  /** Start playing while the audio is still arriving. */
  private async playStreaming(res: Response, gen: number): Promise<void> {
    const source = new MediaSource();
    const url = URL.createObjectURL(source);
    const audio = new Audio(url);
    const finished = this.watch(audio, () => URL.revokeObjectURL(url));
    const reader = res.body!.getReader();
    try {
      await new Promise<void>((r) => source.addEventListener("sourceopen", () => r(), { once: true }));
      const buffer = source.addSourceBuffer("audio/mpeg");
      const append = (chunk: Uint8Array) =>
        new Promise<void>((r, reject) => {
          buffer.addEventListener("updateend", () => r(), { once: true });
          buffer.addEventListener("error", () => reject(new Error("append")), { once: true });
          buffer.appendBuffer(chunk as BufferSource);
        });
      let started = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (gen !== this.generation || audio !== this.current) {
          void reader.cancel();
          break;
        }
        if (done) break;
        await append(value);
        if (!started) {
          started = true;
          audio.play().catch(() => audio.dispatchEvent(new Event("error")));
        }
      }
      if (source.readyState === "open") source.endOfStream();
    } catch {
      audio.dispatchEvent(new Event("error"));
    }
    return finished;
  }

  /** Download the whole piece, then play it (browsers without streaming support). */
  private async playWhole(res: Response, gen: number): Promise<void> {
    const blob = await res.blob().catch(() => null);
    if (!blob || gen !== this.generation) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    const finished = this.watch(audio, () => URL.revokeObjectURL(url));
    audio.play().catch(() => audio.dispatchEvent(new Event("error")));
    return finished;
  }

  /** The browser's own voice, if the real one can't be fetched. */
  private fallback(text: string, gen: number): Promise<void> {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || gen !== this.generation) return Promise.resolve();
    return new Promise((resolve) => {
      browserSpeak(text);
      const poll = window.setInterval(() => {
        if (!window.speechSynthesis.speaking || gen !== this.generation) {
          window.clearInterval(poll);
          resolve();
        }
      }, 120);
    });
  }

  /** Silence now and drop everything queued. */
  stop() {
    this.generation++;
    for (const item of this.queue) item.ctrl.abort();
    this.queue = [];
    const playing = this.current;
    this.current = null;
    playing?.pause();
    playing?.dispatchEvent(new Event("error")); // settles a piece that hadn't started playing yet
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    this.running = false;
    this.set(false);
  }
}
