/**
 * Entity-graph retrieval over the curated dataset. Deterministic and fast:
 * an entity plus its neighbours (teammates, rivals, teams, matches) and every
 * fact that mentions any of them, ranked by closeness to the focus entity.
 */
import { z } from "zod";
import entitiesJson from "../../../data/entities.json";
import relationsJson from "../../../data/relations.json";
import factsJson from "../../../data/facts.json";
import { Entity, Fact, Relation } from "./schema";

const entities = z.array(Entity).parse(entitiesJson);
const relations = z.array(Relation).parse(relationsJson);
const facts = z.array(Fact).parse(factsJson);

const entityById = new Map(entities.map((e) => [e.id, e]));
const factById = new Map(facts.map((f) => [f.id, f]));

export function getEntity(id: string): Entity | undefined {
  return entityById.get(id);
}

export function getFact(id: string): Fact | undefined {
  return factById.get(id);
}

export function allEntities(): Entity[] {
  return entities;
}

/** Resolve a free-text name ("Kohli", "MSD", "Chennai") to an entity. */
export function findEntity(name: string): Entity | undefined {
  const q = name.trim().toLowerCase();
  if (!q) return undefined;
  return (
    entities.find((e) => e.name.toLowerCase() === q || e.aliases.some((a) => a.toLowerCase() === q)) ??
    entities.find((e) => e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)))
  );
}

/** Find every known entity mentioned in a piece of text (names + aliases). */
export function entitiesMentioned(text: string): Entity[] {
  const lower = ` ${text.toLowerCase()} `;
  return entities.filter((e) =>
    [e.name, ...e.aliases].some((n) => n.length >= 3 && new RegExp(`\\b${escapeRegex(n.toLowerCase())}\\b`).test(lower)),
  );
}

export function neighbours(id: string): { entity: Entity; relation: Relation }[] {
  const out: { entity: Entity; relation: Relation }[] = [];
  for (const r of relations) {
    const other = r.from === id ? r.to : r.to === id ? r.from : null;
    if (!other) continue;
    const entity = entityById.get(other);
    if (entity) out.push({ entity, relation: r });
  }
  return out;
}

export type FactBundle = {
  focus: Entity;
  neighbours: { entity: Entity; relation: Relation }[];
  facts: Fact[];
};

/**
 * Facts about the focus entity first, then facts linking it to neighbours,
 * then facts about neighbours alone. Capped at `limit`.
 */
export function retrieveBundle(focusId: string, opts: { limit?: number; also?: string[] } = {}): FactBundle | null {
  const focus = entityById.get(focusId);
  if (!focus) return null;
  const limit = opts.limit ?? 25;
  const near = neighbours(focusId);
  const nearIds = new Set([...near.map((n) => n.entity.id), ...(opts.also ?? [])]);

  const scored = facts
    .map((f) => {
      const hasFocus = f.entities.includes(focusId);
      const nearCount = f.entities.filter((e) => nearIds.has(e)).length;
      const score = (hasFocus ? 10 : 0) + nearCount * 3 + (f.verified ? 1 : 0);
      return { f, score };
    })
    .filter((x) => x.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.f);

  return { focus, neighbours: near, facts: scored };
}

/** Compact text form of a bundle for prompts; facts keep their ids for citation. */
export function bundleToPrompt(b: FactBundle): string {
  const lines = [
    `FOCUS: ${b.focus.name} (${b.focus.type}) — ${b.focus.summary}`,
    `CONNECTED: ${b.neighbours.map((n) => `${n.entity.name} [${n.relation.type}]`).join("; ") || "none"}`,
    "FACTS (cite by id):",
    ...b.facts.map((f) => `[${f.id}] ${f.text} (as of ${f.as_of})`),
  ];
  return lines.join("\n");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
