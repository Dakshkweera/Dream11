"use client";

/**
 * The one Buzzer voice for the whole app. The mic conversation (useConversation), the speaker and the
 * "read replies aloud" logic live here, above every page, so the home hero, the floating dock, the chat drawer
 * and the watch-along panel all control the same conversation instead of each starting their own.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { takeSpeakable } from "@/lib/voice/speakable";
import { useFriend, type Msg } from "../friend-provider";
import { Speaker } from "./speaker";
import { useConversation, type Phase } from "./use-conversation";

type Voice = {
  phase: Phase;
  /** Mic level (RMS), for the waveform. */
  level: number;
  /** What the fan just said (shown while it's being understood). */
  heard: string;
  muted: boolean;
  setMuted: (m: boolean) => void;
  /** A hands-free conversation is on. */
  active: boolean;
  supported: boolean;
  /** Why the mic couldn't start, if it couldn't. */
  error: string;
  /** Turn the mic on. Resolves false when it couldn't (see `error`). */
  start: () => Promise<boolean>;
  stop: () => void;
  /** Read typed-chat replies aloud too. */
  readAloud: boolean;
  setReadAloud: (v: boolean) => void;
  speaker: Speaker;
};

const Ctx = createContext<Voice | null>(null);
export const useVoice = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVoice must be inside <VoiceProvider>");
  return v;
};

/**
 * Reads replies aloud while they stream in: each new assistant message is cut into speakable pieces as text
 * arrives, so the friend starts talking after the first sentence. Messages that existed before voice was
 * turned on, and replies the fan cut off, are never read.
 */
function useSpokenReplies(speaker: Speaker, enabled: boolean, messages: Msg[]) {
  const done = useRef<Set<string>>(new Set());
  const progress = useRef<Map<string, { taken: number; buf: string; first: boolean }>>(new Map());
  const latest = useRef(messages);
  useEffect(() => {
    latest.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!enabled) return;
    done.current = new Set(latest.current.map((m) => m.id)); // only what is said from now on
    progress.current.clear();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || last.pending || done.current.has(last.id)) return;
    if (last.interrupted) {
      done.current.add(last.id);
      return;
    }
    const text = last.story ? `${last.story.title}. ${last.story.body}` : last.text;
    const final = !last.streaming;
    const st = progress.current.get(last.id) ?? { taken: 0, buf: "", first: true };
    if (text.length > st.taken) {
      st.buf += text.slice(st.taken);
      st.taken = text.length;
    }
    for (;;) {
      const { piece, rest } = takeSpeakable(st.buf, { first: st.first, final });
      st.buf = rest;
      if (!piece) break;
      speaker.say(piece);
      st.first = false;
    }
    if (final) {
      done.current.add(last.id);
      progress.current.delete(last.id);
    } else progress.current.set(last.id, st);
  }, [messages, enabled, speaker]);

  /** Stop reading the reply in progress (the fan cut in). */
  return useCallback(() => {
    const last = latest.current[latest.current.length - 1];
    if (last?.role === "assistant") done.current.add(last.id);
  }, []);
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { messages, busy, send, interrupt, open, setOpen, embedded } = useFriend();
  const [speaker] = useState(() => new Speaker());
  const [readAloud, setReadAloud] = useState(false);

  // Hands-free conversation: talk, pause, hear the answer; talk over it to cut in.
  const stopReading = useRef<() => void>(() => {});
  const convo = useConversation({
    speaker,
    busy,
    onTurnEnd: () => speaker.react(), // an instant "Hmm, achha…" the moment the fan stops talking
    onTurn: (t) => void send(t, { voice: true }),
    onInterrupt: () => {
      stopReading.current();
      interrupt();
    },
  });
  const stopReadingNow = useSpokenReplies(speaker, readAloud || convo.active, messages);
  useEffect(() => {
    stopReading.current = stopReadingNow;
  }, [stopReadingNow]);

  // Closing the chat keeps a voice conversation going (talk from any page); it only silences typed-chat replies.
  const visible = open || embedded;
  useEffect(() => {
    if (!visible && !convo.active) speaker.stop();
  }, [visible, convo.active, speaker]);

  const { start: convoStart } = convo;
  const start = useCallback(async () => {
    speaker.preloadReactions();
    const ok = await convoStart();
    if (!ok && !embedded) setOpen(true); // the chat shows why the mic couldn't start
    return ok;
  }, [convoStart, embedded, setOpen, speaker]);

  const toggleReadAloud = useCallback(
    (v: boolean) => {
      if (!v) speaker.stop();
      setReadAloud(v);
    },
    [speaker],
  );

  const value = useMemo<Voice>(
    () => ({
      phase: convo.phase,
      level: convo.level,
      heard: convo.heard,
      muted: convo.muted,
      setMuted: convo.setMuted,
      active: convo.active,
      supported: convo.supported,
      error: convo.error,
      start,
      stop: convo.stop,
      readAloud,
      setReadAloud: toggleReadAloud,
      speaker,
    }),
    [convo.phase, convo.level, convo.heard, convo.muted, convo.setMuted, convo.active, convo.supported, convo.error, start, convo.stop, readAloud, toggleReadAloud, speaker],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
