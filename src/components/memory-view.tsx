"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { initialsOf } from "@/lib/ui/identity";
import { CompareCard } from "./compare-card";
import { useFriend } from "./friend-provider";
import { IconBook, IconBrain, IconCheck, IconSettings, IconSparkles, IconStar, IconTrash, IconUndo, IconUser, IconX } from "./ui/icons";

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

const isLevel = (m: Mem) => m.kind === "knowledge" && /follower$/i.test(m.content);
const isTerm = (m: Mem) => m.kind === "knowledge" && !isLevel(m);

function confidence(strength: number): { label: string; tone: string } {
  if (strength >= 0.66) return { label: "High confidence", tone: "text-good" };
  if (strength >= 0.33) return { label: "Medium confidence", tone: "text-gold" };
  return { label: "Low confidence", tone: "text-muted" };
}

function SourceBadge({ m }: { m: Mem }) {
  return m.source === "stated" ? (
    <span className="badge badge-done">
      <IconCheck size={10} /> You told me
    </span>
  ) : (
    <span className="badge badge-gold">
      <IconSparkles size={10} /> Buzzer inferred
    </span>
  );
}

function Section({ title, hint, children, count }: { title: string; hint: string; children: React.ReactNode; count?: number }) {
  return (
    <section className="card overflow-hidden">
      <header className="border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold">
          {title}
          {count != null && <span className="rounded-full bg-surface-3 px-2 text-[12px] font-semibold text-muted">{count}</span>}
        </h2>
        <p className="mt-0.5 text-[13px] text-muted">{hint}</p>
      </header>
      {children}
    </section>
  );
}

function MemoryRow({ m, busy, onWrong, onDelete }: { m: Mem; busy: boolean; onWrong?: () => void; onDelete: () => void }) {
  const c = confidence(m.strength);
  return (
    <li className="anim-fade-in flex items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="text-[15px] leading-snug">{m.content}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12px] text-muted">
          <SourceBadge m={m} />
          {m.source === "inferred" && (
            <>
              <span className={`font-semibold ${c.tone}`}>{c.label}</span>
              <span>
                · based on {m.evidence} signal{m.evidence === 1 ? "" : "s"}
              </span>
            </>
          )}
          {m.status === "faded" && <span className="badge badge-muted">Fading</span>}
        </div>
        {m.source === "inferred" && (
          <div
            className="mt-2.5 h-1.5 w-40 overflow-hidden rounded-full bg-surface-3"
            role="meter"
            aria-valuenow={Math.round(m.strength * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Confidence"
          >
            <div className="brand-gradient h-full rounded-full" style={{ width: `${Math.max(6, Math.min(100, m.strength * 100))}%` }} />
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onWrong && (
          <button disabled={busy} onClick={onWrong} className="btn-quiet h-9 px-3 text-[12.5px]" title="Correct this: Buzzer will remember you're not into it">
            <IconUndo size={14} /> Not right
          </button>
        )}
        <button disabled={busy} onClick={onDelete} aria-label={`Delete “${m.content}”`} title="Delete" className="icon-btn h-9 w-9 hover:!text-brand-2 disabled:opacity-50">
          <IconTrash size={16} />
        </button>
      </div>
    </li>
  );
}

export function MemoryView() {
  const { setCtx, refreshState, resetSession, state } = useFriend();
  const [mems, setMems] = useState<Mem[] | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"you" | "compare">("you");
  const [demoOpen, setDemoOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ memories: Mem[]; picks: string[] }>("/api/memory");
      setMems(r.memories);
      setPicks(r.picks);
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

  useEffect(() => {
    if (!demoOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDemoOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [demoOpen]);

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
    setDemoOpen(false);
  }

  const live = (mems ?? []).filter((m) => m.status !== "corrected");
  const told = live.filter((m) => m.kind === "stated_preference" && m.polarity === "positive");
  const inferred = live.filter((m) => m.kind === "inferred_interest" && m.polarity === "positive");
  const notInto = live.filter((m) => m.polarity === "negative");
  const levels = live.filter(isLevel);
  const terms = live.filter(isTerm);
  const talked = live.filter((m) => m.kind === "shared_discovery");
  const empty = mems && picks.length === 0 && live.length === 0;

  const wrong = (m: Mem) => () => mutate(() => api("/api/memory", { id: m.id }, "PATCH"));
  const del = (m: Mem) => () => mutate(() => api("/api/memory", { id: m.id }, "DELETE"));
  const rows = (list: Mem[], correctable: boolean) => (
    <ul className="divide-y divide-line">
      {list.map((m) => (
        <MemoryRow key={m.id} m={m} busy={busy} onWrong={correctable ? wrong(m) : undefined} onDelete={del(m)} />
      ))}
    </ul>
  );

  return (
    <main className="page @container pb-nav pt-5 md:pt-8">
      {/* profile */}
      <section className="relative overflow-hidden rounded-[var(--r-xl)] border border-line bg-gradient-to-br from-surface-2 via-surface to-bg-2 p-5 md:p-8">
        <div className="pitch-lines pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <div className="relative flex flex-col gap-6 @4xl:flex-row @4xl:items-center @4xl:justify-between">
          <div className="flex items-center gap-4 pr-10 @4xl:pr-0">
            <span className="brand-gradient inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-display text-[26px] font-bold text-white md:h-20 md:w-20 md:text-[32px]">
              {state?.name ? initialsOf(state.name) : <IconUser size={30} />}
            </span>
            <div className="min-w-0">
              <p className="eyebrow !text-brand-2">Your profile</p>
              <h1 className="mt-0.5 truncate text-[26px] font-bold leading-tight md:text-[30px]">{state?.name ?? "You"}</h1>
              <p className="text-[14px] text-muted">
                <span className="capitalize">{state?.onboarded ? `${state.level} fan` : "Not set up yet"}</span> · What Buzzer knows about you. See it, fix it,
                delete it.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 @md:grid-cols-4 md:gap-3 @4xl:mr-12">
            {[
              { n: told.length, label: "You told me" },
              { n: inferred.length, label: "Inferred" },
              { n: terms.length, label: "Terms learned" },
              { n: picks.length, label: "Team picks" },
            ].map((s) => (
              <div key={s.label} className="min-w-0 rounded-[var(--r-md)] border border-line bg-bg/40 px-3 py-2.5 text-center md:min-w-[96px] md:px-4">
                <p className="font-display text-[26px] font-bold leading-none tabular-nums">{mems ? s.n : "–"}</p>
                <p className="mt-1 truncate text-[11.5px] text-muted">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={() => setDemoOpen(true)}
          className="icon-btn absolute right-3 top-3 h-10 w-10 border border-line bg-bg/40 md:right-5 md:top-5"
          aria-haspopup="dialog"
          aria-label="Demo controls"
          title="Demo controls"
        >
          <IconSettings size={18} />
        </button>
      </section>

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="segmented w-full md:w-auto" role="tablist">
          {(
            [
              ["you", "What Buzzer knows"],
              ["compare", "New fan vs you"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <p className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
          <IconBrain size={14} className="text-good" /> Private to you. Never shown to other fans.
        </p>
      </div>

      {error && <p className="mt-4 rounded-[var(--r-md)] bg-brand/15 p-3 text-[13px] text-brand-2">{error}</p>}

      {tab === "you" && (
        <div className="mt-6">
          {!mems && !error && (
            <div className="grid gap-5 @4xl:grid-cols-2">
              <div className="skeleton h-56" />
              <div className="skeleton h-56" />
            </div>
          )}

          {empty && (
            <div className="card flex flex-col items-center border-dashed px-6 py-12 text-center">
              <IconBrain size={30} className="text-muted" />
              <p className="mt-3 text-[17px] font-semibold">Nothing yet</p>
              <p className="mt-1 max-w-md text-[14px] text-muted">Chat with Buzzer or open a story, and it&apos;ll start learning what you like — you&apos;ll see all of it here.</p>
            </div>
          )}

          {mems && !empty && (
            <div className="grid items-start gap-5 @4xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] @6xl:gap-6">
              <div className="space-y-5">
                {told.length > 0 && (
                  <Section title="You told me" hint="Stays until you change it." count={told.length}>
                    {rows(told, true)}
                  </Section>
                )}
                {inferred.length > 0 && (
                  <Section title="Buzzer inferred" hint="Guesses from what you read and ask. They fade if you move on — correct any that are wrong." count={inferred.length}>
                    {rows(inferred, true)}
                  </Section>
                )}
                {notInto.length > 0 && (
                  <Section title="Not into" hint="Buzzer won't bring these up." count={notInto.length}>
                    {rows(notInto, false)}
                  </Section>
                )}
                {told.length + inferred.length + notInto.length === 0 && (
                  <div className="card border-dashed p-6 text-center text-[14px] text-muted">No preferences yet — tell Buzzer who you follow.</div>
                )}
              </div>

              <div className="space-y-5">
                <Section title="Your knowledge" hint="How Buzzer pitches its answers, per sport.">
                  {levels.length ? rows(levels, false) : <p className="px-5 py-4 text-[14px] text-muted">Buzzer will work this out as you chat.</p>}
                </Section>

                {terms.length > 0 && (
                  <Section title="Terms you've learned" hint="Buzzer won't explain these again." count={terms.length}>
                    <ul className="flex flex-wrap gap-2 p-4">
                      {terms.map((m) => (
                        <li key={m.id} className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface-2 py-1 pl-3 pr-1 text-[13px]">
                          <IconBook size={13} className="text-good" />
                          {m.content.replace(/^learned what (a |an )?/i, "").replace(/ is$/i, "")}
                          <button disabled={busy} onClick={del(m)} aria-label={`Forget “${m.content}”`} className="icon-btn h-6 w-6">
                            <IconX size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {picks.length > 0 && (
                  <Section title="Your team" hint="Players you picked. Buzzer uses them to decide what to bring up." count={picks.length}>
                    <div className="flex flex-wrap gap-2 p-4">
                      {picks.map((p) => (
                        <span key={p} className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[13.5px]">
                          <IconStar size={12} filled className="text-gold" /> {p}
                        </span>
                      ))}
                    </div>
                  </Section>
                )}

                {talked.length > 0 && (
                  <Section title="We've talked about" hint="So Buzzer doesn't repeat itself." count={talked.length}>
                    {rows(talked, false)}
                  </Section>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "compare" && (
        <div className="mt-6">
          <CompareCard />
        </div>
      )}

      {demoOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 md:items-center md:p-6" onClick={() => setDemoOpen(false)}>
          <section
            role="dialog"
            aria-label="Demo controls"
            onClick={(e) => e.stopPropagation()}
            className="sheet-anim w-full rounded-t-[28px] border border-line bg-bg-2 p-5 pb-8 md:max-w-md md:rounded-[var(--r-xl)] md:pb-6"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line-strong md:hidden" aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-semibold">Demo controls</h2>
                <p className="mt-1 text-[13px] text-muted">
                  For walking someone through the prototype.{state && state.daysShifted > 0 ? ` Time moved forward ${state.daysShifted} days.` : ""}
                </p>
              </div>
              <button onClick={() => setDemoOpen(false)} className="icon-btn h-9 w-9" aria-label="Close">
                <IconX size={18} />
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              <button disabled={busy} onClick={() => demo("later")} className="btn-quiet h-12 justify-start px-4">
                Come back 7 days later
              </button>
              <button disabled={busy} onClick={() => demo("riya")} className="btn-quiet h-12 justify-start px-4">
                Load “Riya”, who follows Kohli
              </button>
              <button disabled={busy} onClick={() => demo("reset")} className="btn-quiet h-12 justify-start px-4">
                Reset to a brand-new fan
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
