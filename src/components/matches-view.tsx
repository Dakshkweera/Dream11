"use client";

import { useEffect, useMemo, useState } from "react";
import type { MatchSummary } from "@/lib/match/view";
import { sportLabel } from "@/lib/ui/identity";
import { useFriend } from "./friend-provider";
import { EmptyState, MatchCard, SectionHeader } from "./ui/sport";

/** Every match: watch-alongs, results and fixtures, filterable by sport. */
export function MatchesView({ matches }: { matches: MatchSummary[] }) {
  const { setCtx } = useFriend();
  const context = useMemo(() => ({ surface: "home" as const, label: "Matches list", entityIds: matches.flatMap((m) => m.teams.map((t) => t.id)) }), [matches]);
  useEffect(() => setCtx(context), [context, setCtx]);

  const sports = [...new Set(matches.map((m) => m.sport))];
  const [sport, setSport] = useState<string>("all");
  const shown = matches.filter((m) => sport === "all" || m.sport === sport);
  const watch = shown.filter((m) => m.hasClip);
  const results = shown.filter((m) => !m.hasClip && m.status !== "upcoming");
  const upcoming = shown.filter((m) => m.status === "upcoming");

  return (
    <main className="page @container pb-nav pt-5 md:pt-8">
      <header className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow !text-brand-2">Match centre</p>
          <h1 className="mt-1 font-display text-[38px] font-extrabold uppercase leading-none tracking-wide md:text-[46px]">Matches</h1>
          <p className="mt-2 text-[14.5px] text-muted">Watch along with Buzzer, catch up on results, or see what&apos;s next.</p>
        </div>
        {sports.length > 1 && (
          <div className="segmented self-start" role="tablist" aria-label="Sport">
            {["all", ...sports].map((s) => (
              <button key={s} role="tab" aria-selected={sport === s} onClick={() => setSport(s)}>
                {s === "all" ? "All" : sportLabel(s)}
              </button>
            ))}
          </div>
        )}
      </header>

      {shown.length === 0 && <EmptyState title="No matches here yet" />}

      {watch.length > 0 && (
        <section className="mb-10">
          <SectionHeader title="Watch along" hint="Play the match with Buzzer listening to the commentary beside you." />
          <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {watch.map((m) => (
              <MatchCard key={m.id} m={m} featured />
            ))}
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section className="mb-10">
          <SectionHeader title="Results" />
          <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {results.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mb-10">
          <SectionHeader title="Upcoming" hint="Ask Buzzer what to watch for before they start." />
          <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {upcoming.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
