import { HomeView } from "@/components/home-view";
import { getEntity } from "@/lib/facts/retrieve";
import { allMatches } from "@/lib/match/data";

export default function Home() {
  const matches = allMatches().map((m) => ({
    id: m.id,
    title: m.title,
    subtitle: m.subtitle,
    status: m.status,
    teams: m.teams,
    teamNames: [getEntity(m.teams[0])?.name ?? m.teams[0], getEntity(m.teams[1])?.name ?? m.teams[1]] as [string, string],
    hasClip: !!m.video,
  }));
  return <HomeView matches={matches} />;
}
