"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useFriend } from "./friend-provider";
import { NudgeCard } from "./nudge-card";

type MatchCard = { id: string; title: string; subtitle: string; status: string; teams: [string, string]; teamNames: [string, string]; hasClip: boolean };

export function HomeView({ matches }: { matches: MatchCard[] }) {
  const { state, setCtx, setOpen } = useFriend();
  const context = useMemo(() => ({ surface: "home" as const, label: "Home screen", entityIds: [] as string[] }), []);

  useEffect(() => setCtx(context), [context, setCtx]);

  return (
    <main>
      <header className="flex items-center justify-between px-4 pb-3 pt-5">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted">Fantasy · Sports</p>
          <h1 className="text-xl font-bold">{state?.name ? `Hey ${state.name}` : "Welcome"} 👋</h1>
        </div>
        <span className="brand-gradient rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Prototype</span>
      </header>

      <section className="space-y-4 px-4">
        {state && !state.onboarded ? (
          <div className="rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/15 to-surface p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-2">New</p>
            <h2 className="mt-1 text-[17px] font-semibold leading-snug">Meet Buzzer, your sports friend</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Tell it who you follow. It learns what you care about and shows you the stories, rivalries and history behind them.
            </p>
            <button onClick={() => setOpen(true)} className="brand-gradient mt-3 rounded-full px-5 py-2 text-sm font-semibold text-white">
              Say hello
            </button>
          </div>
        ) : (
          <NudgeCard surface="home" context={context} />
        )}

        <div>
          <h2 className="mb-2 text-sm font-semibold">Matches</h2>
          <div className="space-y-3">
            {matches.map((m) => (
              <Link
                key={m.id}
                href={`/match/${m.id}`}
                className="block rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-brand/60"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      m.hasClip ? "bg-brand/20 text-brand-2" : "bg-surface-2 text-muted"
                    }`}
                  >
                    {m.hasClip ? "● Watch-along" : "Upcoming"}
                  </span>
                  <span className="text-[11px] text-muted">{m.subtitle}</span>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[16px] font-semibold leading-snug">
                  <span>{m.teamNames[0]}</span>
                  <span className="text-xs font-normal text-muted">vs</span>
                  <span className="text-right">{m.teamNames[1]}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <p className="pb-4 text-center text-[11px] leading-relaxed text-muted">
          Independent prototype inspired by fantasy-sports apps — not affiliated with Dream11. Facts as of 2025 (IPL) and Paris 2024; items marked
          &ldquo;awaiting human check&rdquo; are still being verified.
        </p>
      </section>
    </main>
  );
}
