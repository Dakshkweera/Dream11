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
  send: (text: string) => Promise<void>;
  openStory: (entityId: string, opts?: { angle?: string; fromThread?: boolean; reveal?: boolean }) => Promise<void>;
  say: (text: string, kind?: Msg["kind"]) => void;
  askMoment: (question: string, frames: string[], ctx: PageContext) => Promise<void>;
  refreshState: () => Promise<void>;
  resetSession: () => void;
  toast: string | null;
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
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [ctx, setCtxState] = useState<PageContext>({ surface: "home", entityIds: [] });
  const [state, setState] = useState<SessionState | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState("s_init");
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

  const setCtx = useCallback((c: PageContext) => setCtxState(c), []);

  const say = useCallback((text: string, kind?: Msg["kind"]) => {
    setMessages((m) => [...m, { id: mid(), role: "assistant", text, kind }]);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const reply: Msg = { id: mid(), role: "assistant", text: "", pending: true };
      setMessages((m) => [...m, { id: mid(), role: "user", text }, reply]);
      setBusy(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, context: ctxRef.current }),
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
          setMessages((m) =>
            m.map((x) =>
              x.id === reply.id
                ? { ...x, text: visible, pending: visible.length === 0, label: searching && visible.length === 0 ? "🌐 Looking that up…" : undefined }
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
        setMessages((m) => m.map((x) => (x.id === reply.id ? { ...x, text: visible, pending: false, label: undefined, notes, sources } : x)));
        if (notes.length) {
          flash(notes[0]);
          refreshState().catch(() => {});
        }
      } catch (e) {
        setMessages((m) =>
          m.map((x) => (x.id === reply.id ? { ...x, pending: false, text: (e as Error).message || "Something went wrong — try again." } : x)),
        );
      } finally {
        setBusy(false);
      }
    },
    [flash, refreshState],
  );

  const openStory = useCallback(
    async (entityId: string, opts: { angle?: string; fromThread?: boolean; reveal?: boolean } = {}) => {
      if (opts.reveal !== false) setOpen(true);
      const reply: Msg = { id: mid(), role: "assistant", text: "", pending: true, label: "📖 Digging up the story…" };
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
    [flash, refreshState],
  );

  const askMoment = useCallback(
    async (question: string, frames: string[], c: PageContext) => {
      setOpen(true);
      const reply: Msg = { id: mid(), role: "assistant", text: "", pending: true, kind: "moment", label: "👀 Looking at the last few seconds…" };
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
    [refreshState],
  );

  const value = useMemo<Friend>(
    () => ({ open, setOpen, messages, busy, ctx, setCtx, state, epoch, sessionId, send, openStory, say, askMoment, refreshState, resetSession, toast }),
    [open, messages, busy, ctx, setCtx, state, epoch, sessionId, send, openStory, say, askMoment, refreshState, resetSession, toast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
