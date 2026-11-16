"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiscoverItem, Rivalry } from "@/lib/discover/catalog";
import { sportLabel } from "@/lib/ui/identity";
import { EntityCard, RivalryCard, usePlayerSheet } from "./discover-cards";
import { useFriend, type Story } from "./friend-provider";
import { StoryReader, StoryTile } from "./story-card";
import { EmptyState, SectionHeader } from "./ui/sport";
import { useProfileSignals } from "./use-profile-signals";

/**
 * Personal discovery: the stories Buzzer has told you, then players, teams and rivalries — ordered by what
 * you follow and what Buzzer has noticed you like. Not a news feed.
 */
export function DiscoverView({ sports, items, rivalries }: { sports: string[]; items: DiscoverItem[]; rivalries: Rivalry[] }) {
  const { setCtx, messages } = useFriend();
  const [sport, setSport] = useState("all");
  const [q, setQ] = useState("");
  const [reading, setReading] = useState<Story | null>(null);
  const signals = useProfileSignals();
  const sheet = usePlayerSheet();

  const context = useMemo(() => ({ surface: "home" as const, label: "Discover: players, teams and stories", entityIds: [] as string[] }), []);
  useEffect(() => setCtx(context), [context, setCtx]);

  // Stories already told in this conversation (newest first, one per title).
  const stories = useMemo(() => {
    const seen = new Set<string>();
    return messages
      .filter((m) => m.story)
      .map((m) => m.story!)
      .reverse()
      .filter((s) => (seen.has(s.title) ? false : (seen.add(s.title), true)));
  }, [messages]);

  const query = q.trim().toLowerCase();
  const inScope = (i: DiscoverItem) => (sport === "all" || i.sport === sport) && (!query || `${i.name} ${i.summary}`.toLowerCase().includes(query));
  const score = (i: DiscoverItem) => {
    const s = signals.signal(i.name);
    return s?.kind === "follow" ? 3 + s.strength : s?.kind === "interest" ? 2 + s.strength : s?.kind === "not" ? -1 : 0;
  };
  const visible = items.filter(inScope).filter((i) => score(i) >= 0);
  const forYou = visible.filter((i) => score(i) > 0).sort((a, b) => score(b) - score(a));
  const teams = visible.filter((i) => i.type === "team");
  const players = visible.filter((i) => i.type === "player").sort((a, b) => score(b) - score(a));
  const comps = visible.filter((i) => i.type === "competition");
  const rivals = rivalries.filter((r) => (sport === "all" || r.sport === sport) && (!query || `${r.aName} ${r.bName}`.toLowerCase().includes(query)));

  const grid = "grid grid-cols-2 gap-3 @2xl:grid-cols-3 @2xl:gap-4 @5xl:grid-cols-4 @7xl:grid-cols-5";

  return (
    <main className="page @container pb-nav pt-5 md:pt-8">
      <header className="mb-6 flex flex-col gap-4 md:mb-8 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="eyebrow !text-brand-2">Picked for you</p>
          <h1 className="mt-1 font-display text-[38px] font-extrabold uppercase leading-none tracking-wide md:text-[46px]">Discover</h1>
          <p className="mt-2 max-w-xl text-[14.5px] text-muted">The players, teams and rivalries behind the sports you follow — and the stories Buzzer has told you.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players and teams" aria-label="Search players and teams" className="field sm:w-64" />
          {sports.length > 1 && (
            <div className="segmented self-start" role="tablist" aria-label="Sport">
              {["all", ...sports].map((s) => (
                <button key={s} role="tab" aria-selected={sport === s} onClick={() => setSport(s)}>
                  {s === "all" ? "All" : sportLabel(s)}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {!query && (
        <section className="mb-10">
          <SectionHeader title="Your stories" hint="Stories Buzzer has told you, kept here to come back to." />
          {stories.length ? (
            <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
              {stories.slice(0, 6).map((s) => (
                <StoryTile key={s.title} story={s} onOpen={() => setReading(s)} />
              ))}
            </div>
          ) : (
            <EmptyState title="No stories yet">Tap a player or team below, or ask Buzzer — every story it tells you lands here.</EmptyState>
          )}
        </section>
      )}

      {forYou.length > 0 && !query && (
        <section className="mb-10">
          <SectionHeader title="For you" eyebrow="From your memory" hint="People and teams you follow, or that Buzzer noticed you like." />
          <div className={grid}>
            {forYou.slice(0, 10).map((i) => (
              <EntityCard key={i.id} item={i} signal={signals.signal(i.name)} onPlayer={sheet.open} />
            ))}
          </div>
        </section>
      )}

      {rivals.length > 0 && (
        <section className="mb-10">
          <SectionHeader title="Rivalries" hint="The match-ups with history." />
          <div className="grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-3">
            {rivals.map((r) => (
              <RivalryCard key={`${r.a}-${r.b}`} r={r} />
            ))}
          </div>
        </section>
      )}

      {teams.length > 0 && (
        <section className="mb-10">
          <SectionHeader title="Teams" />
          <div className={grid}>
            {teams.map((i) => (
              <EntityCard key={i.id} item={i} signal={signals.signal(i.name)} onPlayer={sheet.open} />
            ))}
          </div>
        </section>
      )}

      {players.length > 0 && (
        <section className="mb-10">
          <SectionHeader title="Players" />
          <div className={grid}>
            {players.map((i) => (
              <EntityCard key={i.id} item={i} signal={signals.signal(i.name)} onPlayer={sheet.open} />
            ))}
          </div>
        </section>
      )}

      {comps.length > 0 && (
        <section className="mb-10">
          <SectionHeader title="Competitions" />
          <div className={grid}>
            {comps.map((i) => (
              <EntityCard key={i.id} item={i} signal={signals.signal(i.name)} onPlayer={sheet.open} />
            ))}
          </div>
        </section>
      )}

      {visible.length === 0 && rivals.length === 0 && <EmptyState title={`Nothing matches “${q}”`}>Try another name, or ask Buzzer directly.</EmptyState>}

      {reading && <StoryReader story={reading} onClose={() => setReading(null)} />}
      {sheet.node}
    </main>
  );
}
