import "server-only";
import relationsJson from "../../../data/relations.json";
import { allEntities, getEntity } from "@/lib/facts/retrieve";

/** A player, team or competition the fan can explore. */
export type DiscoverItem = {
  id: string;
  name: string;
  type: "player" | "team" | "competition";
  sport: string;
  summary: string;
  /** Team a player plays for. */
  teamId?: string;
  /** "Captain" when the dataset says so. */
  role?: string;
};

/** A rivalry between two teams, from the relation graph. */
export type Rivalry = { a: string; b: string; aName: string; bName: string; note?: string; sport: string };

type RawRelation = { from: string; type: string; to: string; note?: string };
const relations = relationsJson as RawRelation[];

export function discoverCatalog(): { sports: string[]; items: DiscoverItem[]; rivalries: Rivalry[] } {
  const playsFor = new Map(relations.filter((r) => r.type === "plays_for").map((r) => [r.from, r.to]));
  const captains = new Set(relations.filter((r) => r.type === "captained").map((r) => r.from));
  const order = { team: 0, player: 1, competition: 2 } as const;

  const items: DiscoverItem[] = allEntities()
    .filter((e) => !e.concept && (e.type === "player" || e.type === "team" || e.type === "competition"))
    .map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type as DiscoverItem["type"],
      sport: e.sport,
      summary: e.summary,
      teamId: playsFor.get(e.id),
      role: captains.has(e.id) ? "Captain" : undefined,
    }))
    .sort((x, y) => order[x.type] - order[y.type]);

  const rivalries: Rivalry[] = relations
    .filter((r) => r.type === "rival_of")
    .map((r) => ({
      a: r.from,
      b: r.to,
      aName: getEntity(r.from)?.name ?? r.from,
      bName: getEntity(r.to)?.name ?? r.to,
      note: r.note,
      sport: getEntity(r.from)?.sport ?? "cricket",
    }));

  const sports = [...new Set(items.map((i) => i.sport))].sort((a, b) => (a === "cricket" ? -1 : b === "cricket" ? 1 : a.localeCompare(b)));
  return { sports, items, rivalries };
}
