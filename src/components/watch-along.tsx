"use client";

/**
 * Watch-along: the match video, the public match chat, and the fan's private Buzzer — three separate areas.
 * - Desktop: video is the largest area; chat and Buzzer sit beside it (stacked, or side by side from 1680px).
 * - Mobile: video and score on top, then a Community / My Buzzer switch.
 * - Fullscreen takes the whole watch-along (not just the video), so chat and Buzzer stay usable.
 * Buzzer's answers (including "why did this happen?") appear in its own panel — never in a modal over the video.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { PageContext } from "@/lib/friend/context";
import type { TimelineBall } from "@/lib/match/data";
import type { MatchSummary } from "@/lib/match/view";
import { BuzzerAvatar } from "./buzzer-avatar";
import { Composer, ConversationMessages, useSuggestions } from "./buzzer/conversation";
import { CommunityPanel } from "./community/community-panel";
import { useFriend } from "./friend-provider";
import { IconChevronDown, IconChevronLeft, IconExpand, IconEye, IconHeadphones, IconLock, IconShrink, IconUsers } from "./ui/icons";
import { EntityAvatar, StatusBadge, TeamCrest } from "./ui/sport";
import { teamIdentity } from "@/lib/ui/identity";
import { useVoice } from "./voice/voice-provider";
import { PhasePill } from "./voice/voice-visuals";

type Heard = { t: number; text: string };
type ListenStatus = "idle" | "listening" | "fallback" | "unsupported" | "off";

const CHUNK_MS = 10_000;
/** Commentary older than this (in video seconds) is no longer "now": not shown, not sent to Buzzer. */
const HEARD_WINDOW_S = 45;
/**
 * A jump in the video bigger than this starts listening afresh from the new spot. Above 8 s on purpose:
 * "Why did this happen?" steps back up to 8 s to grab frames, and that must not wipe the commentary.
 */
const JUMP_S = 12;
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

export type WatchAlongProps = {
  match: MatchSummary;
  title: string;
  video: string | null;
  timeline: TimelineBall[];
  entityIds: string[];
};

export function WatchAlong({ match: m, title, video, timeline, entityIds }: WatchAlongProps) {
  const { setCtx, sessionId, say, askMoment, busy, embed, messages } = useFriend();
  const voice = useVoice();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [status, setStatus] = useState<ListenStatus>("idle");
  const [heard, setHeard] = useState<Heard[]>([]);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [momentOpen, setMomentOpen] = useState(false);
  const [clock, setClock] = useState(0);
  const [tab, setTab] = useState<"community" | "buzzer">("community");
  const [collapsed, setCollapsed] = useState<"community" | "buzzer" | null>(null);
  // Buzzer replies already seen; the rest show as a badge on the My Buzzer tab (mobile).
  // (Only replies that arrive while watching count; earlier history, ids starting "h", loads after mount.)
  const assistantCount = messages.filter((x) => x.role === "assistant" && !x.id.startsWith("h")).length;
  const [seen, setSeen] = useState(assistantCount);
  const unread = tab === "buzzer" ? 0 : Math.max(0, assistantCount - seen);

  const heardRef = useRef<Heard[]>([]);
  // Bumped whenever the fan jumps in the video: results recorded before the jump are thrown away.
  const listenEpoch = useRef(0);
  const lastTimeRef = useRef(0);
  const playingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
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

  // Anything that would have opened the drawer (an answer, a story) brings the Buzzer panel forward instead.
  const showBuzzer = useCallback(() => {
    setTab("buzzer");
    setCollapsed((c) => (c === "buzzer" ? null : c));
  }, []);
  const showCommunity = () => {
    setSeen(assistantCount);
    setTab("community");
  };

  // This page shows Buzzer inline, so the floating drawer never opens over the video.
  useEffect(() => embed(showBuzzer), [embed, showBuzzer]);

  const baseCtx = useMemo<PageContext>(() => ({ surface: "match", label: `${title} watch-along`, entityIds }), [title, entityIds]);

  const ballAt = useCallback(
    (t: number) => {
      let last: TimelineBall | null = null;
      for (const b of timeline) if (b.t <= t) last = b;
      return last;
    },
    [timeline],
  );

  /** Context sent to the friend, including the live commentary window and ball state. */
  const liveContext = useCallback((): PageContext => {
    const v = videoRef.current;
    const t = v?.currentTime ?? 0;
    const b = ballAt(t);
    // Only what was said around this moment, so an answer never mixes in commentary from another part of the match.
    const transcript = heardRef.current
      .filter((h) => h.t >= t - HEARD_WINDOW_S && h.t <= t + 2)
      .map((h) => h.text)
      .join(" ")
      .slice(-TRANSCRIPT_CHARS);
    return {
      ...baseCtx,
      match: {
        id: m.id,
        videoTime: Math.round(t),
        ball: b ? `${b.over} · ${b.battingTeam} ${b.score} · ${b.batter} vs ${b.bowler} · ${b.event}` : undefined,
        transcript: transcript || undefined,
      },
    };
  }, [ballAt, baseCtx, m.id]);

  useEffect(() => setCtx(baseCtx), [baseCtx, setCtx]);

  // Keep the friend's context current while the video plays, so typed or spoken questions know the moment.
  useEffect(() => {
    if (clock > 0 && clock % 5 === 0) setCtx(liveContext());
  }, [clock, liveContext, setCtx]);

  // The video's own error event can fire before hydration, so check the file explicitly.
  useEffect(() => {
    if (!video) return;
    let cancelled = false;
    fetch(video, { method: "HEAD" })
      .then((r) => !cancelled && !r.ok && setVideoFailed(true))
      .catch(() => !cancelled && setVideoFailed(true));
    return () => {
      cancelled = true;
    };
  }, [video]);

  // ---- proactive comments from what was heard -----------------------------
  const maybeComment = useCallback(async () => {
    if (liveBusy.current || !heardRef.current.length || sessionId === "s_init") return;
    liveBusy.current = true;
    try {
      const ctx = liveContext();
      setCtx(ctx);
      const out = await api<{ comment: string | null }>("/api/live", { context: ctx, sessionId });
      if (out.comment) say(out.comment, "live");
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
    async (blob: Blob, t: number, epoch: number) => {
      try {
        const form = new FormData();
        form.append("audio", blob, "chunk.webm");
        form.append("matchId", m.id);
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        if (!res.ok) throw new Error(String(res.status));
        const { text } = (await res.json()) as { text: string };
        // The fan jumped elsewhere while this was being transcribed: it no longer describes what's on screen.
        const now = videoRef.current?.currentTime ?? t;
        if (epoch !== listenEpoch.current || Math.abs(now - t) > HEARD_WINDOW_S) return;
        pushHeard(text, t);
      } catch {
        // Live transcription failed (offline, no credit…): switch to the pre-transcribed commentary.
        if (await loadFallback()) setStatus("fallback");
      }
    },
    [loadFallback, m.id, pushHeard],
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
    const epoch = listenEpoch.current;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      // A chunk that spans a jump mixes two moments: skip it.
      if (blob.size > 4000 && statusRef.current === "listening" && epoch === listenEpoch.current) void sendChunk(blob, startedAt, epoch);
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
      setPlaying(true);
      if (enabledRef.current && statusRef.current === "idle") setStatus("listening");
    };
    const onStop = () => {
      playingRef.current = false;
      setPlaying(false);
      stopCycle();
    };
    const onTime = () => {
      lastTimeRef.current = v.currentTime;
      setClock(Math.floor(v.currentTime));
    };
    // A real jump (the fan scrubbing to another part of the match) makes the old commentary stale: forget it and
    // listen afresh from the new spot. Small moves (normal playback, the frame grab) are ignored.
    const onSeeked = () => {
      if (Math.abs(v.currentTime - lastTimeRef.current) > JUMP_S) {
        listenEpoch.current++;
        heardRef.current = [];
        setHeard([]);
        stopCycle(); // its audio spans the jump; it restarts from here if still playing
        if (playingRef.current && statusRef.current === "listening") startCycleRef.current();
      }
      onTime();
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onStop);
    v.addEventListener("ended", onStop);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onSeeked);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onStop);
      v.removeEventListener("ended", onStop);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onSeeked);
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
    showBuzzer();
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

  // The commentary line for where the video is now (not just the last thing transcribed, which may be from earlier).
  const nowHeard = heard.filter((h) => h.t <= clock + 2 && h.t >= clock - 30).at(-1);

  // Listening only happens while the video plays; when it's paused, say so instead of claiming to listen.
  const pausedNote = "Paused — I'll pick the commentary back up when you press play";
  const listeningNow = status === "listening" && playing;
  const statusLabel: Record<ListenStatus, string> = {
    idle: "Press play — I'll listen to the commentary",
    listening: playing ? "Listening to the commentary" : pausedNote,
    fallback: playing ? "Using saved commentary" : pausedNote,
    unsupported: "Audio capture isn't supported in this browser",
    off: "Not listening — I only look when you ask",
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

  const showVideo = !!video && !videoFailed;
  const ball = useMemo(() => ballAt(clock), [ballAt, clock]);

  // ---- fullscreen: the whole watch-along, so chat and Buzzer stay on screen ----
  useEffect(() => {
    const sync = () => setFull(!!stageRef.current && document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  useEffect(() => {
    if (!full) return;
    // Phones without the fullscreen API get a full-window view; Escape closes it.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  async function toggleFull() {
    const el = stageRef.current;
    if (!el) return;
    if (full) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setFull(false);
      return;
    }
    if (el.requestFullscreen) {
      try {
        await el.requestFullscreen();
        setFull(true);
        return;
      } catch {
        /* fall through to the full-window view */
      }
    }
    setFull(true);
  }

  const suggestions = useSuggestions(true);
  const [a, b] = m.teams;
  const r = m.result;
  const matchLabel = `${a.code} vs ${b.code}`;

  /* ---------------------------------------------------------------- pieces */

  const scoreStrip = (
    <div className="flex items-center gap-3 rounded-[var(--r-md)] border border-line bg-surface px-3 py-2.5 md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <TeamCrest teamId={a.id} size={30} />
        <span className="font-display text-[18px] font-bold tracking-wide">{a.code}</span>
        {r && <span className="font-display text-[20px] font-bold tabular-nums">{r.scores[a.id]}</span>}
        <span className="px-1 text-[12px] text-subtle">–</span>
        {r && <span className="font-display text-[20px] font-bold tabular-nums">{r.scores[b.id]}</span>}
        <span className="font-display text-[18px] font-bold tracking-wide">{b.code}</span>
        <TeamCrest teamId={b.id} size={30} />
      </div>
      {ball ? (
        <div className="hidden min-w-0 text-right sm:block">
          <p className="truncate text-[13px] font-semibold">
            {ball.battingTeam} {ball.score} · {ball.event}
          </p>
          <p className="truncate text-[11.5px] text-muted">
            Over {ball.over} · {ball.batter} vs {ball.bowler}
          </p>
        </div>
      ) : (
        r && <p className="hidden truncate text-[12.5px] font-semibold text-good sm:block">Final · {r.summary}</p>
      )}
    </div>
  );

  /** "Why did this happen?": Buzzer looks at the last few seconds of video. Answers go to the Buzzer panel. */
  const momentBox = (
    <div className="rounded-[var(--r-md)] border border-line bg-surface p-2">
      <div className="flex gap-2">
        <button onClick={() => void ask("Why did this happen?")} disabled={asking || busy} className="btn-quiet h-10 flex-1 px-3 text-[13.5px]">
          <IconEye size={16} /> {asking ? "Looking at the last few seconds…" : "Why did this happen?"}
        </button>
        <button onClick={() => setMomentOpen((v) => !v)} aria-expanded={momentOpen} className="btn-ghost h-10 shrink-0 px-3 text-[13px]">
          {momentOpen ? "Cancel" : "Ask about it"}
        </button>
      </div>
      {momentOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!question.trim()) return;
            setMomentOpen(false);
            void ask(question);
          }}
          className="mt-2 flex gap-2"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Was that a foul?"
            aria-label="Ask about this moment"
            maxLength={300}
            autoFocus
            className="field !py-2 text-[14px]"
          />
          <button type="submit" disabled={asking || busy || !question.trim()} className="btn-primary h-10 shrink-0 px-4 text-[13.5px]">
            Ask
          </button>
        </form>
      )}
      <p className="mt-1.5 hidden px-1 text-[11px] text-subtle lg:block">Buzzer looks at the last few seconds of video and answers privately in My Buzzer.</p>
    </div>
  );

  const buzzerPanel = (
    <section aria-label="My Buzzer — private" className="panel flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-gradient-to-r from-brand/12 to-transparent px-4 py-3">
        <BuzzerAvatar size={36} live={voice.phase === "speaking" || listeningNow} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[15px] font-semibold leading-tight">
            My Buzzer
            {voice.active ? (
              <PhasePill phase={voice.phase} muted={voice.muted} />
            ) : (
              <span className="badge badge-muted !text-[9.5px]">
                <IconLock size={9} /> Private
              </span>
            )}
          </p>
          <p className="flex items-center gap-1.5 truncate text-[12px] text-muted" aria-live="polite">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${listeningNow ? "dot bg-good" : status === "fallback" && playing ? "bg-gold" : "bg-subtle"}`} />
            {statusLabel[status]}
          </p>
        </div>
        <button
          onClick={toggleListening}
          aria-pressed={listenEnabled}
          aria-label={listenEnabled ? "Stop listening to the commentary" : "Listen to the commentary"}
          title={listenEnabled ? "Buzzer is listening to the commentary" : "Let Buzzer listen to the commentary"}
          className="icon-btn h-9 w-9"
        >
          <IconHeadphones size={18} />
        </button>
        <button
          onClick={() => setCollapsed((c) => (c === "buzzer" ? null : "buzzer"))}
          className="icon-btn hidden h-9 w-9 lg:inline-flex 3xl:hidden"
          aria-expanded={collapsed !== "buzzer"}
          aria-label={collapsed === "buzzer" ? "Expand My Buzzer" : "Collapse My Buzzer"}
        >
          <IconChevronDown size={18} className={`transition-transform ${collapsed === "buzzer" ? "-rotate-90" : ""}`} />
        </button>
      </header>

      {collapsed !== "buzzer" && (
        <>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
            <ConversationMessages emptyHint="Ask me anything while you watch — or tap “Why did this happen?” and I'll look at the last few seconds." />
          </div>
          <footer className="shrink-0 space-y-2.5 border-t border-line p-3">
            {showVideo && !voice.active && <div className="lg:hidden">{momentBox}</div>}
            <Composer
              compact
              placeholder="Ask your Buzzer privately…"
              suggestions={suggestions}
              note={
                <span className="inline-flex items-center gap-1">
                  <IconLock size={11} /> Only you see this — Buzzer never posts in the match chat
                </span>
              }
            />
          </footer>
        </>
      )}
    </section>
  );

  const community = (
    <CommunityPanel
      matchId={m.id}
      matchLabel={matchLabel}
      collapsed={collapsed === "community"}
      onToggle={() => setCollapsed((c) => (c === "community" ? null : "community"))}
      className="h-full"
    />
  );

  /* ---------------------------------------------------------------- layout */

  // Right-hand column sizing on desktop: both panels share the height; a collapsed one shrinks to its header.
  const share = (which: "community" | "buzzer") =>
    collapsed === which ? "lg:flex-none" : collapsed ? "lg:flex-1" : which === "community" ? "lg:flex-[1_1_45%]" : "lg:flex-[1_1_55%]";

  return (
    <div ref={stageRef} className={`bg-bg ${full ? "fixed inset-0 z-[60]" : ""}`}>
      <div className="flex h-dvh flex-col">
        {/* top bar */}
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-2.5 md:px-5">
          <Link href={`/match/${m.id}`} aria-label="Back to match centre" className="icon-btn h-10 w-10 bg-surface-2 text-fg">
            <IconChevronLeft size={19} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16px] font-semibold leading-tight md:text-[17px]">
              {a.short} vs {b.short} <span className="font-normal text-muted">· Watch-along</span>
            </h1>
            <p className="truncate text-[12px] text-muted">{m.competition}</p>
          </div>
          <StatusBadge status={m.status} hasClip={m.hasClip} />
          <button onClick={() => void toggleFull()} aria-label={full ? "Exit fullscreen" : "Fullscreen watch-along"} className="btn-quiet hidden h-10 px-4 text-[13px] sm:inline-flex">
            {full ? <IconShrink size={16} /> : <IconExpand size={16} />} {full ? "Exit" : "Fullscreen"}
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4 lg:flex-row lg:gap-4">
          {/* video column */}
          <div className="thin-scroll flex min-w-0 shrink-0 flex-col gap-3 *:shrink-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {showVideo ? (
              <div className="relative overflow-hidden rounded-[var(--r-lg)] border border-line bg-black">
                <video
                  ref={videoRef}
                  src={video!}
                  controls
                  controlsList="nofullscreen"
                  playsInline
                  preload="metadata"
                  className="aspect-video max-h-[42dvh] w-full bg-black object-contain lg:max-h-[calc(100dvh-210px)]"
                  onError={() => setVideoFailed(true)}
                />
                <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
                  <span className="badge bg-black/60 text-white backdrop-blur">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Watch-along
                  </span>
                </div>
                <button
                  onClick={() => void toggleFull()}
                  aria-label={full ? "Exit fullscreen" : "Fullscreen watch-along"}
                  className="icon-btn absolute right-3 top-3 h-9 w-9 bg-black/60 text-white backdrop-blur hover:bg-black/80 sm:hidden"
                >
                  {full ? <IconShrink size={16} /> : <IconExpand size={16} />}
                </button>
              </div>
            ) : (
              <div className="card flex aspect-video max-h-[42dvh] flex-col items-center justify-center border-dashed p-6 text-center lg:max-h-none">
                <p className="font-medium">{video ? "Match clip not found" : "This match hasn't started yet"}</p>
                <p className="mt-1 max-w-sm text-[14px] leading-relaxed text-muted">
                  {video ? `Add the clip at public${video} to enable the watch-along.` : "Buzzer can still tell you what to watch for."}
                </p>
              </div>
            )}

            {scoreStrip}

            {/* desktop: moment questions and match context under the video */}
            <div className="hidden gap-3 lg:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {showVideo && momentBox}
              <div className="rounded-[var(--r-md)] border border-line bg-surface px-4 py-3">
                <p className="eyebrow mb-1.5 inline-flex items-center gap-1.5">
                  <IconHeadphones size={13} className={listeningNow ? "text-good" : ""} /> What Buzzer heard
                </p>
                <p className="line-clamp-3 text-[13px] italic leading-relaxed text-muted">
                  {nowHeard ? `“${nowHeard.text}”` : statusLabel[status]}
                </p>
              </div>
            </div>

            {r?.performers && r.performers.length > 0 && (
              <div className="hidden rounded-[var(--r-md)] border border-line bg-surface p-3 lg:block">
                <p className="eyebrow mb-2 px-1">Key players</p>
                <div className="grid gap-2 xl:grid-cols-2 2xl:grid-cols-3">
                  {r.performers.map((p) => (
                    <div key={p.name} className="flex items-center gap-2.5 rounded-[var(--r-sm)] bg-surface-2 px-2.5 py-2">
                      <EntityAvatar id={p.entityId} name={p.name} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">{p.name}</span>
                        <span className="block truncate text-[11px] text-muted">{p.note ?? teamIdentity(p.team).code}</span>
                      </span>
                      <span className="shrink-0 font-display text-[16px] font-bold tabular-nums">{p.line}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* mobile/tablet: one panel at a time */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:hidden">
            <div className="segmented w-full" role="tablist" aria-label="Chat">
              <button role="tab" aria-selected={tab === "community"} onClick={showCommunity}>
                <IconUsers size={16} /> Community
              </button>
              <button role="tab" aria-selected={tab === "buzzer"} onClick={showBuzzer}>
                <BuzzerAvatar size={18} /> My Buzzer
                {unread > 0 && <span className="brand-gradient ml-0.5 rounded-full px-1.5 text-[11px] leading-[18px] text-white">{unread}</span>}
              </button>
            </div>
            <div className="min-h-0 flex-1">
              {tab === "community" ? community : buzzerPanel}
            </div>
          </div>

          {/* desktop: both panels beside the video */}
          <div className="hidden min-h-0 lg:flex lg:w-[380px] lg:flex-col lg:gap-4 xl:w-[400px] 3xl:w-[760px] 3xl:flex-row">
            <div className={`flex min-h-0 flex-col ${share("community")} 3xl:w-[360px] 3xl:flex-none`}>{community}</div>
            <div className={`flex min-h-0 flex-col ${share("buzzer")} 3xl:flex-1`}>{buzzerPanel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
