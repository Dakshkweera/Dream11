/**
 * Sport-agnostic knowledge schema: entities, relations between them, and
 * atomic facts. Facts are raw material for the LLM — never prewritten stories.
 */
import { z } from "zod";

export const EntityType = z.enum(["player", "team", "venue", "match", "competition", "topic"]);

export const Entity = z.object({
  id: z.string(), // e.g. "player:virat-kohli"
  type: EntityType,
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  sport: z.string().default("cricket"),
  /** Jargon topics (finisher, pick and roll…): asking about one means the fan is LEARNING, not that they follow it. */
  concept: z.boolean().default(false),
  summary: z.string(), // one neutral line, used for disambiguation and prompts
});

export const RelationType = z.enum([
  "plays_for",
  "played_for",
  "captained",
  "rival_of",
  "teammate_of",
  "dismissed_by",
  "played_in",
  "home_ground",
  "won",
]);

export const Relation = z.object({
  from: z.string(),
  type: RelationType,
  to: z.string(),
  note: z.string().optional(),
});

export const FactType = z.enum([
  "record",
  "head_to_head",
  "career_milestone",
  "memorable_match",
  "rivalry_history",
  "team_history",
  "profile",
  "rule",
]);

export const Fact = z.object({
  id: z.string(), // e.g. "f-0001"
  entities: z.array(z.string()).min(1),
  type: FactType,
  text: z.string(),
  /** Numbers stated in `text`, used by the grounding check. */
  numbers: z.array(z.number()).default([]),
  source_url: z.string().url(),
  as_of: z.string(), // ISO date the fact was true
  /** Set to true only after a human checked it against the source. */
  verified: z.boolean().default(false),
});

export type Entity = z.infer<typeof Entity>;
export type Relation = z.infer<typeof Relation>;
export type Fact = z.infer<typeof Fact>;
export type EntityTypeT = z.infer<typeof EntityType>;
