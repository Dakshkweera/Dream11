import { allEntities, getEntity } from "./retrieve";
import type { Entity } from "./schema";

/**
 * Concept topics explain jargon (a yorker, a pick and roll). Asking about one means the fan is LEARNING something,
 * not that they have an interest in it, so it creates "learned" knowledge but never an interest.
 * Which topics are concepts is data (the `concept` flag on the entity), so each sport brings its own.
 */
export const isConcept = (id: string | null | undefined): boolean => !!id && !!getEntity(id)?.concept;

export const conceptEntities = (sport?: string): Entity[] => allEntities().filter((e) => e.concept && (!sport || e.sport === sport));

/** The sport an entity belongs to (cricket if unknown, since that was the first sport). */
export const sportOfEntity = (id: string): string => getEntity(id)?.sport ?? "cricket";

/** The sport a screen is about, from the entities on it (the first one with a sport wins). */
export function sportOfEntities(ids: string[]): string {
  for (const id of ids) {
    const e = getEntity(id);
    if (e && e.type !== "competition") return e.sport;
  }
  return "cricket";
}
