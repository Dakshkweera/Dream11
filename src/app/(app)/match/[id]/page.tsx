import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MatchCentre } from "@/components/match-centre";
import { getEntity } from "@/lib/facts/retrieve";
import { allMatches, getMatch, matchEntities } from "@/lib/match/data";
import { summarize } from "@/lib/match/view";

export function generateStaticParams() {
  return allMatches().map((m) => ({ id: m.id }));
}

export default function MatchPage({ params }: PageProps<"/match/[id]">) {
  return (
    <Suspense fallback={<div className="page pt-8"><div className="skeleton h-72" aria-hidden /></div>}>
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

  return <MatchCentre match={summarize(m)} title={m.title} timeline={m.timeline} teams={teams} entityIds={matchEntities(m)} />;
}
