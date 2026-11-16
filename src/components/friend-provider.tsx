"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, newSessionId, notesFrom, type MemoryNote } from "@/lib/client";
import type { PageContext } from "@/lib/friend/context";
import { stripFactIds } from "@/lib/friend/sanitize";

export type Story = {
  entityId: string;
  title: string;
  body: string;
  threads: { label: string; entityId: string }[];
  sources: { id: string; text: string; url: string; verified: boolean; web?: boolean }[];
  grounded: boolean;
};

export type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  story?: Story;
  notes?: string[];
  /** Web pages a lookup used, shown under the answer. */
  sources?: { title: string; url: string }[];
  /** What a pending reply is doing, e.g. "Looking that up…". */
  label?: string;
  pending?: boolean;
  /** Text is still streaming in. */
  streaming?: boolean;
  /** The fan cut this reply off. */
  interrupted?: boolean;
  kind?: "live" | "moment";
};

type SessionState = { onboarded: boolean; name: string | null; level: string; interests: number; daysShifted: number };

type Friend = {
  open: boolean;
  setOpen: (v: boolean) => void;
  messages: Msg[];
  busy: boolean;
  ctx: PageContext;
  setCtx: (c: PageContext) => void;
  state: SessionState | null;
  /** Increments whenever the user's profile changes enough that nudges should refresh. */
  epoch: number;
  sessionId: string;
  send: (text: string, opts?: { voice?: boolean }) => Promise<void>;
  /** Stop the reply that is streaming in (the fan interrupted). */
  interrupt: () => void;
  openStory: (entityId: string, opts?: { angle?: string; fromThread?: boolean; reveal?: boolean }) => Promise<void>;
  say: (text: string, kind?: Msg["kind"]) => void;
  askMoment: (question: string, frames: string[], ctx: PageContext) => Promise<void>;
  refreshState: () => Promise<void>;
  resetSession: () => void;
  toast: string | null;
  /**
   * A page is showing Buzzer's conversation inline (the watch-along panel). While it is, the floating drawer
   * never opens: `setOpen(true)` asks that panel to come forward instead, so nothing covers the video.
   */
  embedded: boolean;
  /** Register an inline Buzzer panel; `onSummon` runs instead of opening the drawer. Returns the cleanup. */
  embed: (onSummon?: () => void) => () => void;
};

const Ctx = createContext<Friend | null>(null);
export const useFriend = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFriend must be inside <FriendProvider>");
  return v;
};

let seq = 0;
const mid = () => `c${Date.now().toString(36)}${seq++}`;

export function FriendProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false);
  const summon = useRef<(() => void) | null>(null);
  /** Open/close the drawer — or, while a page shows Buzzer inline, bring that panel forward instead. */
  const setOpen = useCallback((v: boolean) => {
    if (v && summon.current) summon.current();
    else setOpenState(v);
  }, []);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [ctx, setCtxState] = useState<PageContext>({ surface: "home", entityIds: [] });
  const [state, setState] = useState<SessionState | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState("s_init");
  const [embeds, setEmbeds] = useState(0);
  const embed = useCallback((onSummon?: () => void) => {
    summon.current = onSummon ?? null;
    setOpenState(false);
    setEmbeds((n) => n + 1);
    return () => {
      if (summon.current === onSummon) summon.current = null;
      setEmbeds((n) => n - 1);
    };
  }, []);
  const embedded = embeds > 0;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const flash = useCallback((t: string) => {
    setToast(t);
    window.setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 3500);
  }, []);

  const refreshState = useCallback(async () => {
    const s = await api<SessionState>("/api/state");
    setState(s);
    setEpoch((e) => e + 1);
  }, []);

  useEffect(() => {
    let sid = "";
    try {
      sid = sessionStorage.getItem("sf_session") ?? "";
    } catch {}
    if (!sid) {
      sid = newSessionId();
      try {
        sessionStorage.setItem("sf_session", sid);
      } catch {}
    }
    setSessionId(sid);
    api<SessionState>("/api/state").then(setState).catch(() => {});
    api<{ messages: { id: string; role: "user" | "assistant"; content: string; story: Story | null; sources?: { title: string; url: string }[] }[] }>("/api/history")
      .then((h) =>
        setMessages(h.messages.map((m) => ({ id: `h${m.id}`, role: m.role, text: m.content, story: m.story ?? undefined, sources: m.sources }))),
      )
      .catch(() => {});
  }, []);

  const resetSession = useCallback(() => {
    const sid = newSessionId();
    try {
      sessionStorage.setItem("sf_session", sid);
    } catch {}
    setSessionId(sid);
    setMessages([]);
  }, []);

  // [stats] Update the ref at once too, so a question sent right after setCtx (e.g. "Ask Buzzer about this
  // performance") carries the new context instead of the previous page's.
  const setCtx = useCallback((c: PageContext) => {
    ctxRef.current = c;
    setCtxState(c);
  }, []);

  const say = useCallback((text: string, kind?: Msg["kind"]) => {
    setMessages((m) => [...m, { id: mid(), role: "assistant", text, kind }]);
  }, []);

  const inflight = useRef<AbortController | null>(null);

  const interrupt = useCallback(() => {
    inflight.current?.abort();
    inflight.current = null;
  }, []);

  const send = useCallback(
    async (text: string, opts: { voice?: boolean } = {}) => {
      interrupt(); // a new message always replaces a reply still in progress
      const ctrl = new AbortController();
      inflight.current = ctrl;
      const reply: Msg = { id: mid(), role: "assistant", text: "", pending: true, streaming: true };
      setMessages((m) => [...m, { id: mid(), role: "user", text }, reply]);
      setBusy(true);
      let shown = "";
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, context: ctxRef.current, voice: opts.voice || undefined }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? "Chat failed");
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let acc = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += value;
          // A leading \u0001 means the friend is running a web lookup.
          const searching = acc.includes("\u0001");
          const visible = stripFactIds(acc.split("\u0000")[0].replace(/\u0001/g, ""));
          // The reply text is complete as soon as the NUL marker arrives; memory notes follow it later.
          const textDone = acc.includes("\u0000");
          shown = visible;
          setMessages((m) =>
            m.map((x) =>
              x.id === reply.id
                ? {
                    ...x,
                    text: visible,
                    pending: visible.length === 0 && !textDone,
                    streaming: !textDone,
                    label: searching && visible.length === 0 ? "Looking that up…" : undefined,
                  }
                : x,
            ),
          );
        }
        const [rawVisible, tail] = acc.split("\u0000");
        const visible = stripFactIds(rawVisible.replace(/\u0001/g, ""));
        let notes: string[] = [];
        let sources: { title: string; url: string }[] = [];
        if (tail) {
          try {
            const parsed = JSON.parse(tail) as { memory: MemoryNote[]; sources?: { title: string; url: string }[] };
            notes = notesFrom(parsed.memory);
            sources = parsed.sources ?? [];
          } catch {}
        }
        setMessages((m) =>
          m.map((x) => (x.id === reply.id ? { ...x, text: visible, pending: false, streaming: false, label: undefined, notes, sources } : x)),
        );
        if (notes.length) {
          flash(notes[0]);
          refreshState().catch(() => {});
        }
      } catch (e) {
        if (ctrl.signal.aborted) {
          // Cut off by the fan: keep what had arrived, drop the bubble if nothing had.
          setMessages((m) =>
            shown
              ? m.map((x) => (x.id === reply.id ? { ...x, text: shown, pending: false, streaming: false, label: undefined, interrupted: true } : x))
              : m.filter((x) => x.id !== reply.id),
          );
        } else {
          setMessages((m) =>
            m.map((x) =>
              x.id === reply.id ? { ...x, pending: false, streaming: false, text: (e as Error).message || "Something went wrong — try again." } : x,
            ),
          );
        }
      } finally {
        if (inflight.current === ctrl) {
          inflight.current = null;
          setBusy(false);
        }
      }
    },
    [flash, refreshState, interrupt],
  );

  const openStory = useCallback(
    async (entityId: string, opts: { angle?: string; fromThread?: boolean; reveal?: boolean } = {}) => {
      if (opts.reveal !== false) setOpen(true);
      const reply: Msg = { id: mid(), role: "assistant", text: "", pending: true, label: "Digging up the story…" };
      setMessages((m) => [...m, reply]);
      setBusy(true);
      try {
        const out = await api<{ story: Story; memory: MemoryNote[] }>("/api/story", {
          entityId,
          angle: opts.angle,
          fromThread: opts.fromThread,
          context: ctxRef.current,
        });
        const notes = notesFrom(out.memory);
        setMessages((m) =>
          m.map((x) => (x.id === reply.id ? { ...x, pending: false, text: out.story.body, story: out.story, notes } : x)),
        );
        if (notes.length) {
          flash(notes[0]);
          refreshState().catch(() => {});
        }
      } catch (e) {
        setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, pending: false, text: (e as Error).message } : x)));
      } finally {
        setBusy(false);
      }
    },
    [flash, refreshState, setOpen],
  );

  const askMoment = useCallback(
    async (question: string, frames: string[], c: PageContext) => {
      setOpen(true);
      const reply: Msg = { id: mid(), role: "assistant", text: "", pending: true, kind: "moment", label: "Looking at the last few seconds…" };
      setMessages((m) => [...m, { id: mid(), role: "user", text: question, kind: "moment" }, reply]);
      setBusy(true);
      try {
        const out = await api<{ answer: string; memory: MemoryNote[] }>("/api/moment", { question, frames, context: c });
        const notes = notesFrom(out.memory);
        setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, pending: false, text: out.answer, notes } : x)));
        if (notes.length) refreshState().catch(() => {});
      } catch (e) {
        setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, pending: false, text: (e as Error).message } : x)));
      } finally {
        setBusy(false);
      }
    },
    [refreshState, setOpen],
  );

  const value = useMemo<Friend>(
    () => ({ open, setOpen, messages, busy, ctx, setCtx, state, epoch, sessionId, send, interrupt, openStory, say, askMoment, refreshState, resetSession, toast, embedded, embed }),
    [open, setOpen, messages, busy, ctx, setCtx, state, epoch, sessionId, send, interrupt, openStory, say, askMoment, refreshState, resetSession, toast, embedded, embed],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
