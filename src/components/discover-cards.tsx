"use client";

import { useState } from "react";
import type { DiscoverItem, Rivalry } from "@/lib/discover/catalog";
import { identityOf, sportLabel, teamIdentity } from "@/lib/ui/identity";
import { useFriend } from "./friend-provider";
import { PlayerSheet, type SheetPlayer } from "./player-sheet";
import { IconBook, IconStar } from "./ui/icons";
import { EntityAvatar, TeamCrest } from "./ui/sport";
import type { Signal } from "./use-profile-signals";

function SignalBadge({ s }: { s?: Signal }) {
  if (!s || s.kind === "not") return null;
  return s.kind === "follow" ? (
    <span className="badge badge-done">
      <IconStar size={10} filled /> You follow
    </span>
  ) : (
    <span className="badge badge-brand">For you</span>
  );
}

/** A player, team or competition. Players open their sheet; teams and competitions open their story. */
export function EntityCard({ item, signal, onPlayer }: { item: DiscoverItem; signal?: Signal; onPlayer: (p: SheetPlayer) => void }) {
  const { openStory, busy } = useFriend();
  const who = identityOf(item.id, item.name);
  const team = item.teamId ? teamIdentity(item.teamId) : null;
  const isPlayer = item.type === "player";

  const open = () =>
    isPlayer ? onPlayer({ name: item.name, entityId: item.id, summary: item.summary, role: item.role }) : void openStory(item.id);

  return (
    <button
      onClick={open}
      disabled={!isPlayer && busy}
      className="card card-interactive group flex h-full w-full flex-col overflow-hidden text-left disabled:opacity-60"
    >
      <div
        className="relative flex h-20 items-end px-4"
        style={{ background: `radial-gradient(120% 160% at 100% 0%, ${who.primary}b3 0%, ${who.primary}26 50%, transparent 80%), var(--surface-2)` }}
      >
        <span aria-hidden className="pointer-events-none absolute right-3 top-1 select-none font-display text-[46px] font-extrabold uppercase leading-none text-white/[0.07]">
          {team?.code ?? who.code}
        </span>
        <EntityAvatar id={item.id} name={item.name} size={52} className="translate-y-1/2 ring-4 ring-surface" />
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-8">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-[15.5px] font-semibold leading-tight">{item.name}</p>
          <SignalBadge s={signal} />
        </div>
        <p className="mt-1 text-[12px] text-muted">
          {[item.role, isPlayer ? team?.code : item.type === "team" ? "Team" : "Competition", sportLabel(item.sport)].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-fg/70">{item.summary}</p>
        <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[13px] font-semibold text-brand-2 transition-colors group-hover:text-coral">
          <IconBook size={14} /> {isPlayer ? "Profile & story" : "Tell me the story"}
        </span>
      </div>
    </button>
  );
}

/** Two teams with history. Opens the story of the first team, angled on the rivalry. */
export function RivalryCard({ r }: { r: Rivalry }) {
  const { openStory, busy } = useFriend();
  const a = teamIdentity(r.a);
  const b = teamIdentity(r.b);
  return (
    <button
      onClick={() => void openStory(r.a, { angle: `The ${r.aName} vs ${r.bName} rivalry${r.note ? ` (${r.note})` : ""}` })}
      disabled={busy}
      className="card card-interactive flex w-full items-center gap-4 p-4 text-left disabled:opacity-60"
      style={{ backgroundImage: `linear-gradient(100deg, ${a.primary}33, transparent 45%, transparent 55%, ${b.primary}33)` }}
    >
      <div className="flex -space-x-3">
        <TeamCrest teamId={r.a} size={44} className="ring-2 ring-surface" />
        <TeamCrest teamId={r.b} size={44} className="ring-2 ring-surface" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[19px] font-bold uppercase leading-none tracking-wide">
          {a.code} <span className="text-subtle">vs</span> {b.code}
        </p>
        <p className="mt-1 truncate text-[12.5px] text-muted">{r.note ?? "Rivalry"}</p>
      </div>
      <IconBook size={18} className="shrink-0 text-muted" />
    </button>
  );
}

/** Holds the player sheet for a list of cards. */
export function usePlayerSheet() {
  const [sheet, setSheet] = useState<SheetPlayer | null>(null);
  const node = sheet ? <PlayerSheet player={sheet} onClose={() => setSheet(null)} /> : null;
  return { open: setSheet, node };
}
