/**
 * Suggestion chips for the friend panel, chosen from the fan's memory and the page they're on.
 * Chosen by code (same frontier logic as nudges); the wording is templated per entity type,
 * so no LLM call or credit is needed and the chips appear instantly.
 */
import { rankDiscoveries } from "../discovery/select";
import { conceptEntities, sportOfEntities } from "../facts/concepts";
import { allEntities, getEntity, neighbours } from "../facts/retrieve";
import type { Entity } from "../facts/schema";
import { levelFor, type KnowledgeLevel, type Profile } from "../memory/service";

const withArticle = (name: string) => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`);

function questionFor(e: Entity, fromName: string | null, level: KnowledgeLevel): string {
  switch (e.type) {
    case "player":
      return fromName ? `How is ${e.name} connected to ${fromName}?` : `What's ${e.name}'s story?`;
    case "team":
      return fromName ? `What's ${e.name}'s story, for a ${fromName} fan?` : `What's the history of ${e.name}?`;
    case "match":
      return `What happened in the ${e.name}?`;
    case "venue":
      return `What's special about ${e.name}?`;
    case "topic":
      // Beginner-style "what is…" questions only for fans still learning the game.
      return e.concept && (level === "new" || level === "casual") ? `What's ${withArticle(e.name.toLowerCase())}?` : `Tell me about ${e.name}`;
    default:
      return `Tell me about ${e.name}`;
  }
}

export type SuggestInput = {
  profile: Profile;
  onScreen: string[];
  /** entity ids surfaced recently, newest first */
  recentlyDiscussed: string[];
  max?: number;
};

export function buildSuggestions({ profile, onScreen, recentlyDiscussed, max = 3 }: SuggestInput): string[] {
  const out: string[] = [];
  const used = new Set<string>();
  // The sport of the screen the fan is on (or, failing that, of what they follow) decides which jargon to offer.
  const sport = sportOfEntities(onScreen.length ? onScreen : profile.interests.map((i) => i.entityId));
  const concepts = conceptEntities(sport).map((e) => e.id);

  const push = (id: string, from: string | null) => {
    const e = getEntity(id);
    if (!e || used.has(id) || out.length >= max) return;
    if (e.concept && profile.learnedEntities.has(id)) return; // already learned
    used.add(id);
    out.push(questionFor(e, from ? (getEntity(from)?.name ?? null) : null, levelFor(profile, e.sport)));
  };

  const ranked = rankDiscoveries({
    interests: profile.interests,
    negatives: profile.negatives,
    onScreen,
    recentlyDiscussed,
    neighbours: (id) => neighbours(id).map((n) => ({ entityId: n.entity.id, relation: n.relation.type, type: n.entity.type })),
  });

  // 1. The best frontier items for this fan, on this page.
  for (const c of ranked.slice(0, 2)) push(c.entityId, c.because.relation === "on_screen" ? null : c.because.fromEntity);

  // 2. A jargon explainer for someone still learning this sport — only for concepts they haven't learned yet.
  const level = levelFor(profile, sport);
  if (level === "new" || level === "casual") {
    const fresh = concepts.filter((id) => !profile.learnedEntities.has(id) && !used.has(id));
    // Prefer a concept tied to something the fan cares about (e.g. the yorker for a Bumrah fan).
    const related = new Set(
      [...profile.interests.map((i) => i.entityId), ...onScreen].flatMap((id) => neighbours(id).map((n) => n.entity.id)),
    );
    const concept = fresh.find((id) => related.has(id)) ?? fresh[0];
    if (concept) push(concept, null);
  }

  // 3. Fill the rest from what's on screen or the fan's interests, then a cold-start default.
  for (const id of [...onScreen, ...profile.interests.map((i) => i.entityId)]) push(id, null);
  if (out.length < max) {
    const popular = allEntities()
      .filter((e) => e.type === "player" && e.sport === sport && !profile.negatives.has(e.id))
      .slice(0, 6);
    for (const e of popular) push(e.id, null);
  }
  return out.slice(0, max);
}
