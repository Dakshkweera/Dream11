/**
 * Proactive discovery — decided by code, not the LLM.
 * Picks the most relevant thing to bring up next from the "frontier" of the
 * fan's interests: entities connected to what they care about, boosted by what
 * is on screen, penalised if already discussed, never something they rejected.
 */
import type { Relation } from "../facts/schema";

export type Candidate = {
  entityId: string;
  score: number;
  /** Why this was picked — becomes the story's angle hint. */
  because: { fromEntity: string | null; relation: Relation["type"] | "on_screen" | "interest" };
};

export type SelectInput = {
  interests: { entityId: string; weight: number }[];
  negatives: Set<string>;
  onScreen: string[];
  /** entity ids surfaced in the last few days (newest first) — strongly avoided */
  recentlyDiscussed: string[];
  /** entity ids surfaced longer ago — mildly avoided, so a returning fan gets fresh material first */
  olderDiscussed?: string[];
  neighbours: (id: string) => { entityId: string; relation: Relation["type"]; type: string }[];
  /** Optional filter, e.g. keep to the sport of the screen the fan is on. */
  allow?: (entityId: string) => boolean;
};

const RELATION_WEIGHT: Partial<Record<Relation["type"], number>> = {
  rival_of: 1.0,
  teammate_of: 0.9,
  dismissed_by: 0.9,
  captained: 0.7,
  // A fan of a player usually already knows that player's team — weak discovery.
  plays_for: 0.45,
  played_for: 0.6,
  played_in: 0.6,
  home_ground: 0.3,
  won: 0.5,
};

/** All candidates, best first. */
export function rankDiscoveries(input: SelectInput): Candidate[] {
  const interestIds = new Set(input.interests.map((i) => i.entityId));
  const scores = new Map<string, Candidate>();
  const bump = (entityId: string, score: number, because: Candidate["because"]) => {
    if (input.negatives.has(entityId) || input.allow?.(entityId) === false) return;
    const prev = scores.get(entityId);
    if (!prev || score > prev.score) scores.set(entityId, { entityId, score, because });
    else prev.score += score * 0.25; // multiple paths in = a little more relevant
  };

  // 1. The frontier: neighbours of what the fan cares about.
  for (const i of input.interests) {
    for (const n of input.neighbours(i.entityId)) {
      if (n.type === "competition" || n.type === "venue") continue;
      if (interestIds.has(n.entityId)) continue; // already known territory
      bump(n.entityId, i.weight * (RELATION_WEIGHT[n.relation] ?? 0.4), { fromEntity: i.entityId, relation: n.relation });
    }
  }

  // 2. What's on screen: strongly relevant, especially if it connects to an interest.
  for (const id of input.onScreen) {
    const linked = input.neighbours(id).find((n) => interestIds.has(n.entityId));
    if (interestIds.has(id)) bump(id, 0.8, { fromEntity: id, relation: "interest" });
    else if (linked) bump(id, 1.2, { fromEntity: linked.entityId, relation: linked.relation });
    else bump(id, 0.5, { fromEntity: null, relation: "on_screen" });
  }

  // 3. A brand-new fan with nothing on screen: start from a known interest itself.
  if (!scores.size) for (const i of input.interests) bump(i.entityId, i.weight * 0.5, { fromEntity: i.entityId, relation: "interest" });

  // 4. Novelty: heavily penalise recently discussed entities (most recent = strongest penalty).
  for (const c of scores.values()) {
    const idx = input.recentlyDiscussed.indexOf(c.entityId);
    if (idx >= 0) c.score *= idx < 3 ? 0.05 : 0.4;
    else if (input.olderDiscussed?.includes(c.entityId)) c.score *= 0.5;
  }

  return [...scores.values()].filter((c) => c.score > 0.05).sort((a, b) => b.score - a.score);
}

export function selectDiscovery(input: SelectInput): Candidate | null {
  return rankDiscoveries(input)[0] ?? null;
}

/** Human-readable angle hint for the story prompt. */
export function angleFor(c: Candidate, name: (id: string) => string): string {
  const target = name(c.entityId);
  if (!c.because.fromEntity || c.because.relation === "on_screen") return `Why ${target} matters right now`;
  const from = name(c.because.fromEntity);
  if (c.because.relation === "interest") return `A side of ${target} the fan may not know yet`;
  const how: Record<string, string> = {
    rival_of: `the rivalry between ${from} and ${target}`,
    teammate_of: `what ${target} means to ${from} as a teammate`,
    dismissed_by: `the duel between ${from} and ${target}`,
    captained: `${from}'s story as captain of ${target}`,
    plays_for: `how ${from} fits into ${target}'s story`,
    played_in: `how ${from} connects to ${target}`,
  };
  return `Start from ${from} (the fan already cares about them) and open the door to ${how[c.because.relation] ?? target}.`;
}
