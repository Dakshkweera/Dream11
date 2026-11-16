"use client";

/**
 * Hands-free spoken conversation, the way a person talks:
 * - The mic stays open. Code notices when the fan starts and stops talking (no button to hold).
 * - A pause ends the fan's turn and sends it. If they carry on talking before the text comes back, the two parts
 *   are joined into one turn instead of being answered separately.
 * - If the fan talks while the friend is speaking (or about to), the friend stops at once and listens.
 * - The second before the fan started talking is kept, so the first word is never clipped.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Endpointer, rms } from "@/lib/voice/endpointer";
import { isPhantom } from "@/lib/voice/speakable";
import { encodeWav } from "@/lib/voice/wav";
import type { Speaker } from "./speaker";

export type Phase = "off" | "starting" | "listening" | "hearing" | "transcribing" | "thinking" | "speaking";

/** Runs on the audio thread: hands the page 20 ms frames of raw mic samples. */
const TAP = `class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.size = Math.round(sampleRate * 0.02); this.buf = new Float32Array(this.size); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.size) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor("buzzer-tap", Tap);`;

/** This browser can capture the mic the way the conversation needs. Never changes, so nothing to subscribe to. */
const micSupported = () => !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== "undefined";
const noSubscribe = () => () => {};

/** Audio kept from before a turn is detected, so the first word ("Wait, …") is never clipped. */
const PREROLL_MS = 1000;

/** A video playing out loud in the app (the match clip): its sound reaches the mic, like the friend's own voice. */
const mediaPlaying = () =>
  typeof document !== "undefined" && [...document.querySelectorAll("video")].some((v) => !v.paused && !v.muted && v.volume > 0);

type Options = {
  speaker: Speaker;
  /** A reply is on its way (streaming or waiting). */
  busy: boolean;
  /** The fan finished a turn: send what they said. */
  onTurn: (text: string) => void;
  /** The fan just stopped talking (before the words are back from speech-to-text). */
  onTurnEnd?: () => void;
  /** The fan started talking over a reply: cut it off. */
  onInterrupt: () => void;
};

type Audio = { ctx: AudioContext; stream: MediaStream; node: AudioWorkletNode };

export function useConversation({ speaker, busy, onTurn, onTurnEnd, onInterrupt }: Options) {
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [transcribing, setTranscribing] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [heard, setHeard] = useState("");
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);

  const audio = useRef<Audio | null>(null);
  const ep = useRef(new Endpointer());
  const preroll = useRef<Float32Array[]>([]);
  const turn = useRef<Float32Array[]>([]);
  const held = useRef<string[]>([]);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const early = useRef<Promise<string> | null>(null);
  const levelAt = useRef(0);
  // The audio thread calls back outside React; it reads the latest values from here.
  const live = useRef({ busy, muted, onTurn, onTurnEnd, onInterrupt });
  useEffect(() => {
    live.current = { busy, muted, onTurn, onTurnEnd, onInterrupt };
  }, [busy, muted, onTurn, onTurnEnd, onInterrupt]);

  useEffect(() => speaker.onChange(setSpeaking), [speaker]);

  /** Send whatever was said, unless the fan is mid-sentence again (then it waits and is joined to the next part). */
  const deliver = useCallback((text: string | null) => {
    if (text && !isPhantom(text)) {
      held.current.push(text);
      setHeard(held.current.join(" "));
    }
    if (ep.current.inTurn || !held.current.length) return;
    const full = held.current.join(" ");
    held.current = [];
    live.current.onTurn(full);
  }, []);

  /** Start turning audio into text; returns the text when it comes back ("" on failure). */
  const startTranscript = useCallback((frames: Float32Array[], rate: number): Promise<string> => {
    const form = new FormData();
    form.append("audio", new Blob([encodeWav(frames, rate)], { type: "audio/wav" }), "turn.wav");
    form.append("purpose", "conversation");
    return fetch("/api/transcribe", { method: "POST", body: form })
      .then((r) => (r.ok ? (r.json() as Promise<{ text?: string }>) : { text: "" }))
      .then((d) => (d.text ?? "").trim())
      .catch(() => "");
  }, []);

  /** Hand a transcript to the conversation, in the order the fan spoke even if results come back out of order. */
  const deliverInOrder = useCallback(
    (text: Promise<string>) => {
      setTranscribing((n) => n + 1);
      chain.current = chain.current.then(async () => {
        const t = await text;
        setTranscribing((n) => n - 1);
        deliver(t);
      });
    },
    [deliver],
  );

  const onFrame = useCallback(
    (frame: Float32Array, rate: number) => {
      const lvl = rms(frame);
      const t = performance.now();
      if (t - levelAt.current > 70) {
        levelAt.current = t;
        setLevel(lvl);
      }
      if (live.current.muted) return;
      const frameMs = (frame.length / rate) * 1000;
      const ev = ep.current.push(lvl, frameMs, speaker.speaking || mediaPlaying());

      if (ev === "start") {
        turn.current = [...preroll.current, frame];
        preroll.current = [];
        setHearing(true);
        if (!held.current.length) setHeard("");
        // Talking over the friend: it stops and listens, like a person would.
        if (speaker.speaking || live.current.busy) {
          speaker.stop();
          live.current.onInterrupt();
        }
      } else if (ev === "pause") {
        // Start transcribing at the first short pause. If the fan has finished, the text is nearly back
        // by the time the turn officially ends; if they carry on, this early guess is dropped.
        turn.current.push(frame);
        early.current = ep.current.worthSending ? startTranscript([...turn.current], rate) : null;
      } else if (ev === "resume") {
        early.current = null;
        turn.current.push(frame);
      } else if (ev === "end" || ev === "discard") {
        const frames = [...turn.current, frame];
        const guess = early.current;
        turn.current = [];
        early.current = null;
        setHearing(false);
        if (ev === "end") {
          live.current.onTurnEnd?.();
          deliverInOrder(guess ?? startTranscript(frames, rate));
        }
        else chain.current = chain.current.then(() => deliver(null)); // a cough: send anything already held
      } else if (ep.current.inTurn) {
        turn.current.push(frame);
      } else {
        preroll.current.push(frame);
        while (preroll.current.length * frameMs > PREROLL_MS) preroll.current.shift();
      }
    },
    [speaker, startTranscript, deliverInOrder, deliver],
  );

  const stop = useCallback(() => {
    const a = audio.current;
    audio.current = null;
    if (a) {
      a.node.port.onmessage = null;
      a.node.disconnect();
      a.stream.getTracks().forEach((t) => t.stop());
      void a.ctx.close().catch(() => {});
    }
    speaker.stop();
    ep.current.reset();
    preroll.current = [];
    turn.current = [];
    held.current = [];
    early.current = null;
    setActive(false);
    setHearing(false);
    setLevel(0);
    setHeard("");
  }, [speaker]);

  /** Turn the mic on. Resolves false if it couldn't (no permission, no mic); `error` says why. */
  const start = useCallback(async (): Promise<boolean> => {
    if (audio.current) return true;
    if (starting) return false;
    setError("");
    setStarting(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      const ctx = new AudioContext();
      const url = URL.createObjectURL(new Blob([TAP], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "buzzer-tap");
      const silent = ctx.createGain();
      silent.gain.value = 0; // keeps the graph running without playing the mic back
      source.connect(node);
      node.connect(silent);
      silent.connect(ctx.destination);
      node.port.onmessage = (e: MessageEvent<Float32Array>) => onFrame(e.data, ctx.sampleRate);
      ep.current = new Endpointer();
      audio.current = { ctx, stream, node };
      setActive(true);
      return true;
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      const denied = (e as DOMException)?.name === "NotAllowedError";
      setError(denied ? "Allow the microphone for this site to talk to Buzzer." : "Couldn't start the microphone on this device.");
      return false;
    } finally {
      setStarting(false);
    }
  }, [onFrame, starting]);

  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    if (m) {
      ep.current.reset();
      turn.current = [];
      setHearing(false);
    }
  }, []);

  useEffect(() => stop, [stop]);

  const phase: Phase = !active
    ? starting
      ? "starting"
      : "off"
    : hearing
      ? "hearing"
      : transcribing > 0
        ? "transcribing"
        : speaking
          ? "speaking"
          : busy
            ? "thinking"
            : "listening";

  // false on the server and during hydration, then the browser's real answer — so the first client render
  // matches the server HTML (a plain `typeof window` check here caused a hydration mismatch).
  const supported = useSyncExternalStore(noSubscribe, micSupported, () => false);

  return { phase, active, supported, start, stop, muted, setMuted, level, heard, error };
}
