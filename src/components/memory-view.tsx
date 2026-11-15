"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { CompareCard } from "./compare-card";
import { useFriend } from "./friend-provider";

type Mem = {
  id: string;
  kind: "stated_preference" | "inferred_interest" | "knowledge" | "shared_discovery";
  content: string;
  source: "stated" | "inferred";
  polarity: "positive" | "negative";
  entity: string | null;
  evidence: number;
  strength: number;
  status: "active" | "faded" | "corrected";
};

const SECTIONS: { title: string; hint: string; match: (m: Mem) => boolean }[] = [
  { title: "Things you told me", hint: "Stays until you change it", match: (m) => m.kind === "stated_preference" && m.polarity === "positive" },
  { title: "Things I noticed", hint: "Guesses from what you read and ask. They fade if you move on", match: (m) => m.kind === "inferred_interest" && m.polarity === "positive" },
  { title: "What you know about cricket", hint: "Shapes how I explain things", match: (m) => m.kind === "knowledge" },
  { title: "Things you're not into", hint: "I won't bring these up", match: (m) => m.polarity === "negative" },
  { title: "What we've talked about", hint: "So I don't repeat myself", match: (m) => m.kind === "shared_discovery" },
];

export function MemoryView() {
  const { setCtx, refreshState, resetSession, state } = useFriend();
  const [mems, setMems] = useState<Mem[] | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setMems((await api<{ memories: Mem[] }>("/api/memory")).memories);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setCtx({ surface: "memory", label: "What Buzzer knows about the fan", entityIds: [] });
  }, [setCtx]);

  useEffect(() => {
    let cancelled = false;
    api<{ memories: Mem[]; picks: string[] }>("/api/memory")
      .then((r) => !cancelled && (setMems(r.memories), setPicks(r.picks), setError("")))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [state?.interests]);

  async function mutate(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await refreshState();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function demo(action: "later" | "reset" | "riya") {
    await mutate(async () => {
      await api("/api/demo", { action, days: action === "later" ? 7 : undefined });
      resetSession();
    });
  }

  return (
    <main className="px-4 pb-6 pt-5">
      <h1 className="text-xl font-bold">What Buzzer knows about you</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Everything is here, marked as <b className="text-fg">told</b> or <b className="text-fg">noticed</b>. Delete anything, or tell me when I&apos;ve got it wrong.
      </p>

      {error && <p className="mt-3 rounded-xl bg-brand/15 p-3 text-xs text-brand-2">{error}</p>}
      {!mems && !error && <div className="mt-4 h-32 animate-pulse rounded-2xl bg-surface" />}

      {mems && picks.length === 0 && mems.filter((m) => m.status !== "corrected").length === 0 && (
        <div className="mt-5 rounded-2xl border border-dashed border-line p-6 text-center">
          <p className="text-sm font-medium">Nothing yet</p>
          <p className="mt-1 text-[12px] text-muted">Chat with Buzzer or open a story and it will start learning what you like.</p>
        </div>
      )}

      {picks.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Your fantasy team</h2>
          <p className="mb-2 text-[11px] text-muted">Players you picked. I use them to decide what to bring up ({picks.length}/11)</p>
          <div className="flex flex-wrap gap-2">
            {picks.map((p) => (
              <span key={p} className="rounded-full border border-gold/40 bg-gold/5 px-3 py-1 text-[12px]">
                ★ {p}
              </span>
            ))}
          </div>
        </section>
      )}

      {mems &&
        SECTIONS.map((s) => {
          const items = mems.filter(s.match);
          if (!items.length) return null;
          return (
            <section key={s.title} className="mt-6">
              <h2 className="text-sm font-semibold">{s.title}</h2>
              <p className="mb-2 text-[11px] text-muted">{s.hint}</p>
              <ul className="space-y-2">
                {items.map((m) => (
                  <li key={m.id} className="anim-fade-in rounded-xl border border-line bg-surface p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[14px] leading-snug">{m.content}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                          <span
                            className={`rounded-full px-2 py-0.5 font-semibold ${m.source === "stated" ? "bg-good/15 text-good" : "bg-gold/15 text-gold"}`}
                          >
                            {m.source === "stated" ? "You told me" : "I noticed"}
                          </span>
                          {m.kind === "inferred_interest" && <span>{m.evidence} signal{m.evidence === 1 ? "" : "s"}</span>}
                          {m.status === "faded" && <span className="text-muted">· fading</span>}
                        </p>
                        {m.kind === "inferred_interest" && (
                          <div className="mt-2 h-1 w-24 overflow-hidden rounded-full bg-surface-2" aria-label={`Strength ${Math.round(m.strength * 100)}%`}>
                            <div className="brand-gradient h-full" style={{ width: `${Math.max(6, Math.min(100, m.strength * 100))}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {(m.kind === "inferred_interest" || m.kind === "stated_preference") && m.polarity === "positive" && (
                          <button
                            disabled={busy}
                            onClick={() => mutate(() => api("/api/memory", { id: m.id }, "PATCH"))}
                            className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted hover:text-fg disabled:opacity-50"
                          >
                            That&apos;s not right
                          </button>
                        )}
                        <button
                          disabled={busy}
                          onClick={() => mutate(() => api("/api/memory", { id: m.id }, "DELETE"))}
                          className="rounded-full px-2.5 py-1 text-[11px] text-muted hover:text-brand-2 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

      <CompareCard />

      <section className="mt-8 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Demo controls</h2>
        <p className="mb-3 mt-1 text-[11px] leading-relaxed text-muted">
          For walking through the product. {state && state.daysShifted > 0 ? `Time moved forward ${state.daysShifted} days.` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => demo("later")} className="rounded-full border border-line px-3 py-1.5 text-xs hover:border-brand disabled:opacity-50">
            ⏩ Come back 7 days later
          </button>
          <button disabled={busy} onClick={() => demo("riya")} className="rounded-full border border-line px-3 py-1.5 text-xs hover:border-brand disabled:opacity-50">
            👩 Load “Riya” (follows Kohli)
          </button>
          <button disabled={busy} onClick={() => demo("reset")} className="rounded-full border border-line px-3 py-1.5 text-xs hover:border-brand disabled:opacity-50">
            ↺ Reset to a new user
          </button>
        </div>
      </section>
    </main>
  );
}
