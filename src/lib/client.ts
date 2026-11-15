/** Browser-side helpers shared by components. */

export async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function newSessionId(): string {
  return `s_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export type MemoryNote = { type: "created" | "updated" | "corrected"; content: string; source: "stated" | "inferred"; kind: string };

const isLevel = (c: MemoryNote) => c.kind === "knowledge" && /follower$/i.test(c.content);

/** Turn memory changes into short, human notes — only what's worth surfacing. */
export function notesFrom(changes: MemoryNote[] | undefined): string[] {
  return (changes ?? [])
    .filter((c) => c.kind !== "shared_discovery" && (c.type === "created" || (c.type === "updated" && isLevel(c) && c.source === "inferred")))
    .map((c) => {
      if (isLevel(c) && c.source === "inferred") return `You seem ready for more detail — I'll treat you as a ${c.content.toLowerCase()}`;
      if (c.kind === "knowledge") return `Noted: ${c.content.replace(/^learned/i, "you learned")}`;
      return c.source === "stated" ? `You told me: ${c.content}` : `I noticed: ${c.content}`;
    });
}

/** Browser speech as a free fallback when the speech API is unavailable. */
export function browserSpeak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  window.speechSynthesis.speak(u);
}
