import { MatchesView } from "@/components/matches-view";
import { allMatches } from "@/lib/match/data";
import { summarize } from "@/lib/match/view";

export const metadata = { title: "Matches — Buzzer" };

export default function MatchesPage() {
  return <MatchesView matches={allMatches().map(summarize)} />;
}
