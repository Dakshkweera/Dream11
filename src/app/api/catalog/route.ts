import { route } from "@/lib/api";
import { allEntities } from "@/lib/facts/retrieve";

const EMOJI: Record<string, string> = { cricket: "🏏", basketball: "🏀" };
const label = (s: string) => s[0].toUpperCase() + s.slice(1);

/** What the onboarding can offer — read from the dataset, so new sports and people show up without code changes. */
export const GET = route(null, async () => {
  const entities = allEntities().filter((e) => !e.concept);
  const sportIds = [...new Set(entities.map((e) => e.sport))].sort((a, b) => (a === "cricket" ? -1 : b === "cricket" ? 1 : a.localeCompare(b)));
  const sports = sportIds.map((id) => {
    const mine = entities.filter((e) => e.sport === id);
    const follow = [...mine.filter((e) => e.type === "player"), ...mine.filter((e) => e.type === "team")].map((e) => ({
      label: e.type === "team" ? (e.aliases[0] ?? e.name) : e.name,
      value: e.name,
    }));
    return { id, label: label(id), emoji: EMOJI[id] ?? "🏅", follow };
  });
  // `follow` (the first sport's people) is kept for older clients.
  return { sports, follow: sports[0]?.follow ?? [] };
});
