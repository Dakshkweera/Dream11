import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MatchView } from "@/components/match-view";
import { getEntity } from "@/lib/facts/retrieve";
import { allMatches, getMatch, matchEntities } from "@/lib/match/data";

export function generateStaticParams() {
  return allMatches().map((m) => ({ id: m.id }));
}

export default function MatchPage({ params }: PageProps<"/match/[id]">) {
  return (
    <Suspense fallback={<div className="m-4 h-48 animate-pulse rounded-2xl bg-surface" aria-hidden />}>
      <Match params={params} />
    </Suspense>
  );
}

async function Match({ params }: { params: PageProps<"/match/[id]">["params"] }) {
  const { id } = await params;
  const m = getMatch(id);
  if (!m) notFound();

  const teams = m.teams.map((teamId) => ({
    id: teamId,
    name: getEntity(teamId)?.name ?? teamId,
    players: (m.squads[teamId] ?? []).map((p) => ({
      name: p.name,
      role: p.role,
      entityId: p.entityId,
      summary: p.entityId ? getEntity(p.entityId)?.summary : undefined,
    })),
  }));

  return (
    <MatchView
      id={m.id}
      title={m.title}
      subtitle={m.subtitle}
      video={m.video}
      timeline={m.timeline}
      teams={teams}
      entityIds={matchEntities(m)}
    />
  );
}
