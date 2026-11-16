import { Suspense } from "react";
import { notFound } from "next/navigation";
import { WatchAlong } from "@/components/watch-along";
import { allMatches, getMatch, matchEntities } from "@/lib/match/data";
import { summarize } from "@/lib/match/view";

export function generateStaticParams() {
  return allMatches().map((m) => ({ id: m.id }));
}

export default function WatchPage({ params }: PageProps<"/match/[id]/watch">) {
  return (
    <Suspense fallback={<div className="h-dvh bg-bg p-4"><div className="skeleton aspect-video w-full" aria-hidden /></div>}>
      <Watch params={params} />
    </Suspense>
  );
}

async function Watch({ params }: { params: PageProps<"/match/[id]/watch">["params"] }) {
  const { id } = await params;
  const m = getMatch(id);
  if (!m) notFound();
  return <WatchAlong match={summarize(m)} title={m.title} video={m.video} timeline={m.timeline} entityIds={matchEntities(m)} />;
}
