"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { DiscoverItem, Rivalry } from "@/lib/discover/catalog";
import type { MatchSummary } from "@/lib/match/view";
import { VoiceHero } from "./buzzer/voice-hero";
import { EntityCard, RivalryCard, usePlayerSheet } from "./discover-cards";
import { useFriend } from "./friend-provider";
import { NudgeCard } from "./nudge-card";
import { MatchCard, SectionHeader } from "./ui/sport";
import { useProfileSignals } from "./use-profile-signals";

function greeting(h: number) {
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
const noSubscribe = () => () => {};
/** "Good evening" from the fan's own clock; the prerendered page says "Welcome back" until it hydrates. */
const useGreeting = () => useSyncExternalStore(noSubscribe, () => greeting(new Date().getHours()), () => "Welcome back");

export function HomeView({ matches, discover, rivalries }: { matches: MatchSummary[]; discover: DiscoverItem[]; rivalries: Rivalry[] }) {
  const { state, setCtx } = useFriend();
  const context = useMemo(() => ({ surface: "home" as const, label: "Home screen", entityIds: [] as string[] }), []);
  useEffect(() => setCtx(context), [context, setCtx]);
  const hello = useGreeting();
  const signals = useProfileSignals();
  const sheet = usePlayerSheet();

  // Watch-alongs first, then results, then fixtures.
  const ordered = [...matches].sort((a, b) => Number(b.hasClip) - Number(a.hasClip) || Number(!!b.result) - Number(!!a.result));

  // Discover: what you follow, then what Buzzer thinks you'd like, then the rest; never what you're "not into".
  const rank = (i: DiscoverItem) => {
    const s = signals.signal(i.name);
    return s?.kind === "follow" ? 3 + s.strength : s?.kind === "interest" ? 2 + s.strength : s?.kind === "not" ? -1 : i.type === "player" ? 1 : 0.5;
  };
  const picks = discover.filter((i) => i.type !== "competition" && rank(i) >= 0).sort((a, b) => rank(b) - rank(a)).slice(0, 8);

  return (
    <main className="page @container pb-nav pt-5 md:pt-8">
      <header className="mb-5 flex items-end justify-between gap-4 md:mb-7">
        <div className="min-w-0">
          <p className="text-[14px] text-muted">{hello}</p>
          <h1 className="truncate text-[26px] font-bold leading-tight md:text-[30px]">{state?.name ?? "Hey there"}</h1>
        </div>
      </header>

      {/* Buzzer first: the hero and what it noticed */}
      <div className="grid gap-5 @5xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)] @5xl:gap-6">
        <VoiceHero />
        {state?.onboarded && <NudgeCard surface="home" context={context} variant="spotlight" />}
      </div>

      <section className="@container mt-10 md:mt-12" aria-labelledby="matches-h">
        <div id="matches-h">
          <SectionHeader title="Matches" eyebrow="Watch with Buzzer" hint="Replays you can watch along to, results and what's next." href="/matches" />
        </div>
        <div className="scroller -mx-4 px-4 md:mx-0 md:grid md:grid-cols-1 md:gap-4 md:overflow-visible md:px-0 @2xl:md:grid-cols-2 @5xl:md:grid-cols-3">
          {ordered.slice(0, 6).map((m, i) => (
            <MatchCard key={m.id} m={m} featured={i === 0 && m.hasClip} className="w-[86%] shrink-0 sm:w-[380px] md:w-auto" />
          ))}
        </div>
      </section>

      <section className="@container mt-10 md:mt-12" aria-labelledby="discover-h">
        <div id="discover-h">
          <SectionHeader
            title="Discover"
            eyebrow={signals.ready ? "Picked from what you follow" : "Players & teams"}
            hint="Tap anyone for their story — Buzzer pitches it at your level."
            href="/discover"
          />
        </div>
        <div className="scroller -mx-4 px-4 md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 @2xl:md:grid-cols-3 @5xl:md:grid-cols-4">
          {picks.map((i) => (
            <div key={i.id} className="w-[220px] shrink-0 md:w-auto">
              <EntityCard item={i} signal={signals.signal(i.name)} onPlayer={sheet.open} />
            </div>
          ))}
        </div>
        {rivalries.length > 0 && (
          <div className="mt-5 grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-3">
            {rivalries.slice(0, 3).map((r) => (
              <RivalryCard key={`${r.a}-${r.b}`} r={r} />
            ))}
          </div>
        )}
      </section>

      <p className="mx-auto mt-12 max-w-2xl text-center text-[12px] leading-relaxed text-subtle">
        Independent prototype, not affiliated with Dream11. Facts as of 2025 (IPL) and Paris 2024; some are still awaiting a human check.
      </p>
      {sheet.node}
    </main>
  );
}
