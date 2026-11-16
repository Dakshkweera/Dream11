"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { communityAdapter, type CommunityAuthor, type CommunityMessage, type Reaction } from "@/lib/community";

export type UiMessage = CommunityMessage & { status?: "sending" | "failed" };

/** Match chat state: loads history, follows live events, posts with optimistic updates. */
export function useCommunity(matchId: string, me: CommunityAuthor) {
  const adapter = useMemo(() => communityAdapter(), []);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [online, setOnline] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    adapter
      .load(matchId)
      .then((snap) => {
        if (cancelled) return;
        setMessages(snap.messages);
        setOnline(snap.presence.online);
        setStatus("ready");
        unsubscribe = adapter.subscribe(matchId, (e) => {
          if (e.type === "message")
            setMessages((m) => {
              // Our own message coming back over the stream replaces its optimistic copy.
              const i = e.message.clientId ? m.findIndex((x) => x.clientId === e.message.clientId) : -1;
              if (i >= 0) return m.map((x, j) => (j === i ? { ...e.message, mine: true } : x));
              return m.some((x) => x.id === e.message.id) ? m : [...m, e.message].slice(-200);
            });
          else if (e.type === "reactions") setMessages((m) => m.map((x) => (x.id === e.messageId ? { ...x, reactions: e.reactions } : x)));
          else setOnline(e.presence.online);
        });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setStatus("error");
        setError(e.message || "Couldn't load the match chat.");
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [adapter, matchId]);

  const send = useCallback(
    async (text: string) => {
      const clientId = `cl_${Math.random().toString(36).slice(2, 10)}`;
      const optimistic: UiMessage = {
        id: clientId,
        clientId,
        matchId,
        author: meRef.current,
        text,
        createdAt: new Date().toISOString(),
        reactions: [],
        mine: true,
        status: "sending",
      };
      setMessages((m) => [...m, optimistic]);
      try {
        const saved = await adapter.post(matchId, text, clientId, meRef.current);
        setMessages((m) => m.map((x) => (x.clientId === clientId ? { ...saved, mine: true, status: undefined } : x)));
      } catch {
        setMessages((m) => m.map((x) => (x.clientId === clientId ? { ...x, status: "failed" } : x)));
      }
    },
    [adapter, matchId],
  );

  const retry = useCallback(
    (clientId: string) => {
      const msg = messages.find((x) => x.clientId === clientId);
      if (!msg) return;
      setMessages((m) => m.filter((x) => x.clientId !== clientId));
      void send(msg.text);
    },
    [messages, send],
  );

  const react = useCallback(
    async (messageId: string, emoji: string) => {
      let on = true;
      setMessages((m) =>
        m.map((x) => {
          if (x.id !== messageId) return x;
          const cur = x.reactions.find((r) => r.emoji === emoji);
          on = !cur?.mine;
          const reactions: Reaction[] = cur
            ? x.reactions
                .map((r) => (r.emoji === emoji ? { ...r, mine: on, count: r.count + (on ? 1 : -1) } : r))
                .filter((r) => r.count > 0)
            : [...x.reactions, { emoji, count: 1, mine: true }];
          return { ...x, reactions };
        }),
      );
      try {
        const server = await adapter.react(matchId, messageId, emoji, on);
        if (server) setMessages((m) => m.map((x) => (x.id === messageId ? { ...x, reactions: server } : x)));
      } catch {
        /* keep the optimistic count; the stream will correct it */
      }
    },
    [adapter, matchId],
  );

  return { source: adapter.source, messages, online, status, error, send, retry, react };
}
