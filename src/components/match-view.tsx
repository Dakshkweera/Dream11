"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { PageContext } from "@/lib/friend/context";
import type { TimelineBall } from "@/lib/match/data";
import { useFriend } from "./friend-provider";
import { NudgeCard } from "./nudge-card";
import { PlayerSheet, type SheetPlayer } from "./player-sheet";

type Player = { name: string; role?: string; entityId?: string; summary?: string };
export type MatchViewProps = {
  id: string;
  title: string;
  subtitle: string;
  video: string | null;
  timeline: TimelineBall[];
  teams: { id: string; name: string; players: Player[] }[];
  entityIds: string[];
};

type Heard = { t: number; text: string };
type ListenStatus = "idle" | "listening" | "fallback" | "unsupported" | "off";

const CHUNK_MS = 10_000;
const TRANSCRIPT_CHARS = 1200;

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener("seeked", done);
      resolve();
    };
    v.addEventListener("seeked", done);
    v.currentTime = t;
    window.setTimeout(done, 2500);
  });
}

/** 3–4 small JPEG frames from the last ~8 seconds (oldest first). Only called when the fan asks. */
async function grabFrames(v: HTMLVideoElement): Promise<string[]> {
  const resumeAt = v.currentTime;
  v.pause();
  const times = [...new Set([resumeAt - 8, resumeAt - 5, resumeAt - 2, resumeAt].map((t) => Math.round(Math.max(0, t) * 10) / 10))];
  const w = 512;
  const h = Math.max(1, Math.round((w * (v.videoHeight || 9)) / (v.videoWidth || 16)));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c2d = canvas.getContext("2d")!;
  const frames: string[] = [];
  for (const t of times) {
    await seek(v, t);
    c2d.drawImage(v, 0, 0, w, h);
    frames.push(canvas.toDataURL("image/jpeg", 0.7));
  }
  await seek(v, resumeAt);
  return frames;
}

function audioStreamOf(v: HTMLVideoElement): MediaStream | null {
  const anyV = v as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
  const s = anyV.captureStream?.() ?? anyV.mozCaptureStream?.();
  const tracks = s?.getAudioTracks() ?? [];
  return tracks.length ? new MediaStream(tracks) : null;
}

export function MatchView(props: MatchViewProps) {
  const { setCtx, sessionId, say, askMoment, busy, state, refreshState } = useFriend();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [sheet, setSheet] = useState<SheetPlayer | null>(null);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<ListenStatus>("idle");
  const [heard, setHeard] = useState<Heard[]>([]);
  const [bubble, setBubble] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [pickError, setPickError] = useState("");
  const [clock, setClock] = useState(0);

  const heardRef = useRef<Heard[]>([]);
  const playingRef = useRef(false);
  const recRef = useRef<{ rec: MediaRecorder; timer: number } | null>(null);
  const liveBusy = useRef(false);
  const fallbackSegs = useRef<{ start: number; end: number; text: string }[] | null>(null);
  const statusRef = useRef<ListenStatus>("idle");
  const startCycleRef = useRef<() => void>(() => {});
  const [listenEnabled, setListenEnabled] = useState(true);
  const enabledRef = useRef(true);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    enabledRef.current = listenEnabled;
  }, [listenEnabled]);

  const baseCtx = useMemo<PageContext>(
    () => ({ surface: "match", label: `${props.title} match page`, entityIds: props.entityIds }),
    [props.title, props.entityIds],
  );

  const ballAt = useCallback(
    (t: number) => {
      let last: TimelineBall | null = null;
      for (const b of props.timeline) if (b.t <= t) last = b;
      return last;
    },
    [props.timeline],
  );

  /** Context sent to the friend, including the live commentary window and ball state. */
  const liveContext = useCallback((): PageContext => {
    const v = videoRef.current;
    const t = v?.currentTime ?? 0;
    const b = ballAt(t);
    const transcript = heardRef.current.map((h) => h.text).join(" ").slice(-TRANSCRIPT_CHARS);
    return {
      ...baseCtx,
      match: {
        id: props.id,
        videoTime: Math.round(t),
        ball: b ? `${b.over} · ${b.battingTeam} ${b.score} · ${b.batter} vs ${b.bowler} · ${b.event}` : undefined,
        transcript: transcript || undefined,
      },
    };
  }, [ballAt, baseCtx, props.id]);

  useEffect(() => setCtx(baseCtx), [baseCtx, setCtx]);

  // The fan's real fantasy team.
  useEffect(() => {
    let cancelled = false;
    api<{ picks: string[] }>("/api/picks")
      .then((r) => !cancelled && setPicks(r.picks))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function togglePick(p: Player) {
    const key = p.entityId ?? `name:${p.name}`;
    const picked = !picks.includes(key);
    const before = picks;
    setPickError("");
    setPicks(picked ? [...picks, key] : picks.filter((k) => k !== key)); // optimistic
    try {
      const r = await api<{ picks: string[] }>("/api/picks", { key, picked });
      setPicks(r.picks);
      refreshState().catch(() => {}); // picks steer what Buzzer brings up
    } catch (e) {
      setPicks(before);
      setPickError((e as Error).message);
    }
  }

  // The video's own error event can fire before hydration, so check the file explicitly.
  useEffect(() => {
    if (!props.video) return;
    let cancelled = false;
    fetch(props.video, { method: "HEAD" })
      .then((r) => !cancelled && !r.ok && setVideoFailed(true))
      .catch(() => !cancelled && setVideoFailed(true));
    return () => {
      cancelled = true;
    };
  }, [props.video]);

  // ---- proactive comments from what was heard -----------------------------
  const maybeComment = useCallback(async () => {
    if (liveBusy.current || !heardRef.current.length || sessionId === "s_init") return;
    liveBusy.current = true;
    try {
      const ctx = liveContext();
      setCtx(ctx);
      const out = await api<{ comment: string | null }>("/api/live", { context: ctx, sessionId });
      if (out.comment) {
        say(out.comment, "live");
        setBubble(out.comment);
        window.setTimeout(() => setBubble(null), 14_000);
      }
    } catch {
      /* a missed interjection is harmless */
    } finally {
      liveBusy.current = false;
    }
  }, [liveContext, say, sessionId, setCtx]);

  const pushHeard = useCallback(
    (text: string, t: number) => {
      const clean = text.trim();
      if (!clean) return;
      heardRef.current = [...heardRef.current, { t, text: clean }].slice(-12);
      setHeard(heardRef.current);
      void maybeComment();
    },
    [maybeComment],
  );

  // ---- continuous commentary transcription (audio only) -------------------
  const loadFallback = useCallback(async () => {
    if (fallbackSegs.current) return true;
    try {
      const res = await fetch("/match/transcript.json");
      if (!res.ok) return false;
      fallbackSegs.current = (await res.json()) as { start: number; end: number; text: string }[];
      return true;
    } catch {
      return false;
    }
  }, []);

  const sendChunk = useCallback(
    async (blob: Blob, t: number) => {
      try {
        const form = new FormData();
        form.append("audio", blob, "chunk.webm");
        form.append("matchId", props.id);
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        if (!res.ok) throw new Error(String(res.status));
        const { text } = (await res.json()) as { text: string };
        pushHeard(text, t);
      } catch {
        // Live transcription failed (offline, no credit…): switch to the pre-transcribed commentary.
        if (await loadFallback()) setStatus("fallback");
      }
    },
    [loadFallback, props.id, pushHeard],
  );

  const startCycle = useCallback(() => {
    const v = videoRef.current;
    if (!v || typeof MediaRecorder === "undefined") {
      setStatus("unsupported");
      return;
    }
    const stream = audioStreamOf(v);
    if (!stream) {
      setStatus("unsupported");
      return;
    }
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = [];
    const startedAt = v.currentTime;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      if (blob.size > 4000 && statusRef.current === "listening") void sendChunk(blob, startedAt);
      if (playingRef.current && statusRef.current === "listening") startCycleRef.current();
    };
    rec.start();
    const timer = window.setTimeout(() => rec.state === "recording" && rec.stop(), CHUNK_MS);
    recRef.current = { rec, timer };
  }, [sendChunk]);

  useEffect(() => {
    startCycleRef.current = startCycle;
  }, [startCycle]);

  const stopCycle = useCallback(() => {
    const cur = recRef.current;
    recRef.current = null;
    if (!cur) return;
    window.clearTimeout(cur.timer);
    if (cur.rec.state === "recording") cur.rec.stop();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => {
      playingRef.current = true;
      if (enabledRef.current && statusRef.current === "idle") setStatus("listening");
    };
    const onStop = () => {
      playingRef.current = false;
      stopCycle();
    };
    const onTime = () => setClock(Math.floor(v.currentTime));
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onStop);
    v.addEventListener("ended", onStop);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onTime);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onStop);
      v.removeEventListener("ended", onStop);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
      stopCycle();
    };
  }, [stopCycle, videoFailed]);

  useEffect(() => {
    if (status === "listening" && playingRef.current && !recRef.current) startCycle();
  }, [status, startCycle]);

  // Fallback mode: serve the pre-transcribed commentary for the current playback time.
  useEffect(() => {
    if (status !== "fallback") return;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || !fallbackSegs.current) return;
      const t = v.currentTime;
      const text = fallbackSegs.current
        .filter((s) => s.end <= t && s.end > t - 45)
        .map((s) => s.text)
        .join(" ");
      if (text && text !== heardRef.current.at(-1)?.text) pushHeard(text, t);
    }, CHUNK_MS);
    return () => window.clearInterval(id);
  }, [status, pushHeard]);

  // ---- "Why did this happen?" --------------------------------------------
  async function ask(q: string) {
    const v = videoRef.current;
    if (!v || asking || busy) return;
    setAsking(true);
    try {
      const frames = await grabFrames(v);
      const ctx = liveContext();
      setCtx(ctx);
      const text = q.trim() || "Why did this happen?";
      setQuestion("");
      await askMoment(text, frames, ctx);
    } finally {
      setAsking(false);
    }
  }

  const statusLabel: Record<ListenStatus, string> = {
    idle: "Press play — Buzzer listens to the commentary",
    listening: "Listening to the commentary",
    fallback: "Using saved commentary",
    unsupported: "Audio capture isn't supported in this browser",
    off: "Listening is off — Buzzer only looks when you ask",
  };
  function toggleListening() {
    if (listenEnabled) {
      setListenEnabled(false);
      stopCycle();
      setStatus("off");
    } else {
      setListenEnabled(true);
      setStatus(playingRef.current ? "listening" : "idle");
    }
  }

  const showVideo = props.video && !videoFailed;
  const ball = useMemo(() => ballAt(clock), [ballAt, clock]);

  return (
    <main>
      <header className="flex items-center gap-3 px-4 pb-3 pt-5">
        <Link href="/" aria-label="Back" className="rounded-full p-1.5 text-muted hover:text-fg">
          ←
        </Link>
        <div>
          <h1 className="text-lg font-bold leading-tight">{props.title}</h1>
          <p className="text-[11px] text-muted">{props.subtitle}</p>
        </div>
      </header>

      <div className="space-y-4 px-4">
        {showVideo ? (
          <div>
            <div className="relative overflow-hidden rounded-2xl border border-line bg-black">
              <video
                ref={videoRef}
                src={props.video!}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full"
                onError={() => setVideoFailed(true)}
              />
              {bubble && (
                <div className="anim-fade-in absolute inset-x-2 bottom-12 rounded-xl border border-gold/50 bg-black/85 p-2.5 text-[12.5px] leading-snug backdrop-blur">
                  <span className="mr-1 font-semibold text-gold">Buzzer:</span>
                  {bubble}
                </div>
              )}
            </div>

            {ball && (
              <div className="mt-2 flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2" aria-live="off">
                <div>
                  <p className="text-[15px] font-bold leading-none">
                    {ball.battingTeam} <span className="tabular-nums">{ball.score}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    Over {ball.over} · {ball.batter} vs {ball.bowler}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                    /wicket|out/i.test(ball.event) ? "bg-brand/20 text-brand-2" : /six|four/i.test(ball.event) ? "bg-gold/20 text-gold" : "bg-surface-2 text-muted"
                  }`}
                >
                  {ball.event}
                </span>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between text-[11px] text-muted" aria-live="polite">
              <span className="flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${status === "listening" ? "dot bg-good" : status === "fallback" ? "bg-gold" : "bg-muted"}`}
                />
                {statusLabel[status]}
              </span>
              <button
                onClick={toggleListening}
                aria-pressed={listenEnabled}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${listenEnabled ? "border-good/40 text-good" : "border-line text-muted"}`}
              >
                🎧 Listening {listenEnabled ? "on" : "off"}
              </button>
            </div>

            {heard.length > 0 && (
              <p className="mt-2 line-clamp-2 rounded-xl bg-surface px-3 py-2 text-[12px] italic leading-relaxed text-muted">
                &ldquo;{heard.at(-1)!.text}&rdquo;
              </p>
            )}

            <div className="mt-3 rounded-2xl border border-line bg-surface p-3">
              <button
                onClick={() => ask("Why did this happen?")}
                disabled={asking || busy}
                className="brand-gradient w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {asking ? "Looking at the last few seconds…" : "🤔 Why did this happen?"}
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(question);
                }}
                className="mt-2 flex gap-2"
              >
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="…or ask about this moment"
                  aria-label="Ask about this moment"
                  maxLength={300}
                  className="min-w-0 flex-1 rounded-full border border-line bg-bg px-4 py-2 text-[13px] placeholder:text-muted"
                />
                <button
                  type="submit"
                  disabled={asking || busy || !question.trim()}
                  className="rounded-full border border-line px-4 text-[13px] disabled:opacity-40"
                >
                  Ask
                </button>
              </form>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                Buzzer pauses the match and looks at the last few seconds only when you ask.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-surface p-5 text-center">
            <p className="text-sm font-medium">{props.video ? "Match clip not found" : "This match hasn't started yet"}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              {props.video
                ? `Add the clip at public${props.video} to enable the watch-along.`
                : "Buzzer can still tell you what to watch for — tap a player below."}
            </p>
          </div>
        )}

        {state?.onboarded && <NudgeCard surface="match" context={baseCtx} />}

        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Pick your team</h2>
          <span className="text-[11px] text-muted" aria-live="polite">
            {picks.length}/11 picked
          </span>
        </div>
        {pickError && <p className="-mt-2 text-xs text-brand-2">{pickError}</p>}

        {props.teams.map((team) => (
          <section key={team.id}>
            <h2 className="mb-2 text-[13px] font-semibold text-muted">{team.name}</h2>
            <ul className="grid grid-cols-2 gap-2">
              {team.players.map((p) => {
                const mine = picks.includes(p.entityId ?? `name:${p.name}`);
                return (
                  <li key={p.name} className="relative">
                    <button
                      onClick={() => setSheet(p)}
                      className={`w-full rounded-xl border py-2.5 pl-3 pr-10 text-left hover:border-brand ${mine ? "border-gold/50 bg-gold/5" : "border-line bg-surface"}`}
                    >
                      <span className="block text-[13px] font-medium leading-tight">{p.name}</span>
                      {p.role && <span className="mt-0.5 block text-[11px] text-muted">{p.role}</span>}
                    </button>
                    <button
                      onClick={() => togglePick(p)}
                      aria-pressed={mine}
                      aria-label={mine ? `Remove ${p.name} from your team` : `Add ${p.name} to your team`}
                      className={`absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-lg ${mine ? "text-gold" : "text-muted hover:text-fg"}`}
                    >
                      {mine ? "★" : "☆"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <div className="h-16" />
      </div>

      {sheet && <PlayerSheet player={sheet} onClose={() => setSheet(null)} />}
    </main>
  );
}
