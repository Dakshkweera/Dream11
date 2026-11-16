/**
 * Community adapter for the PROPOSED backend contract in ./contract.ts. Only used when
 * NEXT_PUBLIC_COMMUNITY_API=on — until the backend ships those routes, the mock adapter is used instead.
 */
import type { CommunityAdapter, CommunityEvent, CommunityMessage, CommunitySnapshot, Reaction } from "./contract";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const base = (matchId: string) => `/api/community/${encodeURIComponent(matchId)}`;

export const apiAdapter: CommunityAdapter = {
  source: "api",
  async load(matchId) {
    return json<CommunitySnapshot>(await fetch(`${base(matchId)}/messages?limit=50`));
  },
  subscribe(matchId, onEvent) {
    const es = new EventSource(`${base(matchId)}/stream`);
    const on = (type: CommunityEvent["type"]) => (e: MessageEvent<string>) => {
      try {
        const data = JSON.parse(e.data);
        if (type === "message") onEvent({ type, message: data as CommunityMessage });
        else if (type === "reactions") onEvent({ type, messageId: data.messageId, reactions: data.reactions });
        else onEvent({ type, presence: data });
      } catch {
        /* ignore malformed events */
      }
    };
    es.addEventListener("message", on("message"));
    es.addEventListener("reactions", on("reactions"));
    es.addEventListener("presence", on("presence"));
    return () => es.close();
  },
  async post(matchId, text, clientId) {
    const r = await json<{ message: CommunityMessage }>(
      await fetch(`${base(matchId)}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, clientId }) }),
    );
    return r.message;
  },
  async react(matchId, messageId, emoji, on) {
    const r = await json<{ reactions: Reaction[] }>(
      await fetch(`${base(matchId)}/messages/${encodeURIComponent(messageId)}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji, on }),
      }),
    );
    return r.reactions;
  },
};
