/**
 * Memory service: reads the user's profile for prompts, applies behaviour
 * signals, and runs LLM extraction → rule-based reconciliation after chats.
 */
import { z } from "zod";
import { json } from "../ai/openrouter";
import { MODELS } from "../ai/models";
import { conceptEntities, isConcept, sportOfEntity } from "../facts/concepts";
import { allEntities, findEntity, getEntity } from "../facts/retrieve";
import { getStore, type EventType, type Memory, type User } from "../store";
import { canDriveNudges, displayStatus, effectiveConfidence, nextLevel, reconcile, signalToOp, type MemoryChange, type MemoryOp } from "./rules";

export type KnowledgeLevel = "new" | "casual" | "regular" | "expert";

export type Profile = {
  memories: Memory[];
  /** Positive interests able to steer nudges, strongest first, with weight. */
  interests: { entityId: string; weight: number; source: "stated" | "inferred" }[];
  negatives: Set<string>;
  /** Cricket level (the first sport; "casual" until told otherwise). Use levelFor() for any sport. */
  level: KnowledgeLevel;
  /** Levels the fan stated or the app inferred, per sport (level:<sport> memories). */
  levels: Record<string, KnowledgeLevel>;
  learned: string[];
  /** Entity ids of concepts the fan has learned (e.g. topic:finisher). */
  learnedEntities: Set<string>;
  discoveries: string[];
  /** Fantasy team picks (entity ids, or "name:<Player>" outside the dataset). */
  picks: string[];
};

/** A fantasy pick is an explicit choice, so it steers discovery almost as strongly as a stated interest. */
export const PICK_WEIGHT = 0.55;

export async function loadProfile(user: User, now: Date): Promise<Profile> {
  const store = getStore();
  const [memories, picks] = await Promise.all([store.listMemories(user.id), store.listPicks(user.id)]);
  const live = memories.filter((m) => displayStatus(m, now) !== "corrected");

  const negatives = new Set(
    live.filter((m) => m.polarity === "negative" && m.subject_entity).map((m) => m.subject_entity!),
  );

  const interests = live
    .filter((m) => canDriveNudges(m, now) && m.subject_entity)
    .map((m) => ({ entityId: m.subject_entity!, weight: effectiveConfidence(m, now), source: m.source }));
  for (const key of picks) {
    if (key.startsWith("name:") || negatives.has(key)) continue;
    const existing = interests.find((i) => i.entityId === key);
    if (existing) existing.weight = Math.max(existing.weight, PICK_WEIGHT);
    else interests.push({ entityId: key, weight: PICK_WEIGHT, source: "stated" });
  }
  interests.sort((a, b) => b.weight - a.weight);
  const isLevelMem = (m: Memory) => m.kind === "knowledge" && !!m.subject_entity?.startsWith("level:");
  const levels: Record<string, KnowledgeLevel> = {};
  for (const m of live) if (isLevelMem(m)) levels[m.subject_entity!.slice("level:".length)] = parseLevel(m.content);
  const level = levels.cricket ?? "casual";
  const learned = live.filter((m) => m.kind === "knowledge" && !isLevelMem(m)).map((m) => m.content);
  const learnedEntities = new Set(live.filter((m) => m.kind === "knowledge" && m.subject_entity && !isLevelMem(m)).map((m) => m.subject_entity!));
  const discoveries = live
    .filter((m) => m.kind === "shared_discovery")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((m) => m.content);

  return { memories, interests, negatives, level, levels, learned, learnedEntities, discoveries, picks };
}

/**
 * The fan's level in a sport. A sport they have never told us about starts at "new":
 * a casual cricket follower is not assumed to know basketball.
 */
export function levelFor(p: Pick<Profile, "level" | "levels">, sport: string): KnowledgeLevel {
  return p.levels[sport] ?? (sport === "cricket" ? p.level : "new");
}

function parseLevel(s?: string): KnowledgeLevel {
  const t = (s ?? "").toLowerCase();
  if (t.includes("expert")) return "expert";
  if (t.includes("regular")) return "regular";
  if (t.includes("new")) return "new";
  return "casual";
}

/**
 * Compact profile text for prompts. Keeps personalisation subtle: facts, not instructions to gush.
 *
 * With `sport`, only that sport's interests, picks and learning are included. A story about basketball is
 * then written without the fan's cricket interests in view, which stops the model forcing "it's like Kohli's
 * chase" analogies that no fact supports. (Chat gets the whole profile.)
 */
export function profileToPrompt(p: Profile, now: Date, sport?: string): string {
  const name = (id: string) => getEntity(id)?.name ?? id;
  const inSport = (id: string | null | undefined) => !sport || (!!id && sportOfEntity(id) === sport);
  const live = p.memories.filter((m) => displayStatus(m, now) === "active");
  const stated = live
    .filter((m) => m.kind === "stated_preference" && m.polarity === "positive" && (sport ? inSport(m.subject_entity) : true))
    .map((m) => m.content);
  const inferred = live
    .filter((m) => m.kind === "inferred_interest" && inSport(m.subject_entity))
    .map((m) => `${name(m.subject_entity ?? "")} (signals: ${m.evidence_count})`);
  const learned = sport
    ? live.filter((m) => m.kind === "knowledge" && !m.subject_entity?.startsWith("level:") && inSport(m.subject_entity)).map((m) => m.content)
    : p.learned;
  const levels = sport ? `${sport} ${levelFor(p, sport)}` : `${Object.entries({ cricket: p.level, ...p.levels }).map(([s, l]) => `${s} ${l}`).join(", ")}; any other sport: new`;
  const lines = [
    `Knowledge level${sport ? "" : " by sport"}: ${levels}`,
    `Told me: ${stated.join("; ") || "nothing yet"}`,
    `Noticed interest in: ${inferred.join("; ") || "nothing yet"}`,
    `Fantasy team picks: ${p.picks.filter((k) => (sport ? inSport(k) : true)).map((k) => (k.startsWith("name:") ? k.slice(5) : name(k))).join(", ") || "none yet"}`,
    `Not interested in: ${[...p.negatives].filter((id) => inSport(id)).map(name).join("; ") || "—"}`,
    `Already learned: ${learned.slice(0, 6).join("; ") || "—"}`,
    `Recent shared discoveries (do not repeat; may reference at most once): ${p.discoveries.slice(0, 5).join("; ") || "—"}`,
  ];
  return lines.join("\n");
}

async function applyOps(user: User, ops: MemoryOp[], now: Date): Promise<MemoryChange[]> {
  if (!ops.length) return [];
  const store = getStore();
  const changes = reconcile(await store.listMemories(user.id), ops, user.id, now);
  await Promise.all(changes.map((c) => store.saveMemory(c.memory)));
  return changes;
}

/** Behaviour signal (no LLM): log the event and nudge the interest's confidence. */
export async function recordSignal(user: User, type: EventType, entityId: string, now: Date, payload?: unknown) {
  const store = getStore();
  await store.addEvent({ user_id: user.id, type, entity_id: entityId, payload, created_at: now.toISOString() });
  const entity = getEntity(entityId);
  if (!entity || isConcept(entityId)) return []; // learning a concept is not an interest in it
  return applyOps(user, [signalToOp(type, entityId, entity.name)], now);
}

export async function rememberDiscovery(user: User, entityId: string, title: string, now: Date) {
  return applyOps(
    user,
    [{ op: "add", kind: "shared_discovery", subject_entity: null, content: `We talked about: ${title}`, source: "inferred", weight: 0.3 }],
    now,
  );
}

export async function applyStatedOps(user: User, ops: MemoryOp[], now: Date) {
  return applyOps(user, ops, now);
}

// ---------------------------------------------------------------------------
// LLM extraction
// ---------------------------------------------------------------------------

const ExtractedOp = z.object({
  op: z.enum(["add", "reinforce", "contradict"]),
  kind: z.enum(["stated_preference", "inferred_interest", "knowledge"]),
  subject: z.string().nullable().describe("Exact name of a player/team/topic from the known list, or null"),
  content: z.string().describe("Short memory as shown to the user, e.g. 'Loves MS Dhoni' or 'Learned what a finisher is'"),
  source: z.enum(["stated", "inferred"]),
  polarity: z.enum(["positive", "negative"]),
});
const Extraction = z.object({ ops: z.array(ExtractedOp) });

const EXTRACT_SYSTEM = `You maintain a sports fan's memory profile for an AI sports friend.
From ONE exchange (fan message + friend reply), propose memory operations. Be conservative: most exchanges need 0–2 ops.

Kinds:
- stated_preference: the fan explicitly says they like/follow/support someone (source "stated").
- inferred_interest: the fan shows curiosity about someone without saying they like them, e.g. asks about them (source "inferred").
- knowledge: what the fan knows. Use subject "level:<sport>" (for example "level:cricket" or "level:basketball") with content "new" | "casual" | "regular" | "expert" ONLY when they reveal their overall level in that sport; otherwise subject = the concept/topic name and content "Learned what X is" when the friend explained a concept they asked about.

Ops: "add" for new, "reinforce" when it repeats something already remembered, "contradict" when the fan corrects or rejects something (e.g. "I'm not into CSK, just Dhoni" → contradict CSK with polarity "negative", content "Not into CSK as a team", plus add/reinforce Dhoni).
Use subjects ONLY from the known list (exact names) or a concept name for knowledge. Never invent facts about the fan.
If the fan STATES that they follow or like something that is NOT on the known list (another sport, a player or team outside it), still add a stated_preference with subject null and a short content that names the sport, e.g. "Follows Lionel Messi (football)" or "Supports Barcelona (football)". Never add this for things the fan merely asks about.`;

/** Run after a chat turn. Returns the applied changes so the UI can show "I'll remember…". */
export async function extractFromExchange(user: User, fanMessage: string, friendReply: string, now: Date) {
  const known = allEntities()
    .filter((e) => e.type !== "match")
    .map((e) => e.name)
    .join(", ");
  const current = (await getStore().listMemories(user.id))
    .filter((m) => m.status !== "corrected")
    .map((m) => `- [${m.kind}] ${m.content}`)
    .join("\n");

  let extraction: z.infer<typeof Extraction>;
  try {
    extraction = await json(
      [
        { role: "system", content: EXTRACT_SYSTEM },
        {
          role: "user",
          content: `Known players/teams/topics: ${known}\n\nCurrent memory:\n${current || "(empty)"}\n\nFan: ${fanMessage}\nFriend: ${friendReply.slice(0, 1500)}`,
        },
      ],
      Extraction,
      { model: MODELS.extract, schemaName: "memory_ops", maxTokens: 1200 },
    );
  } catch (e) {
    console.warn("[memory] extraction failed:", (e as Error).message);
    return [];
  }

  const ops: MemoryOp[] = extraction.ops.slice(0, 4).map((o) => {
    let subject: string | null = null;
    if (o.kind === "knowledge") {
      subject = /^level:[a-z-]+$/.test(o.subject ?? "") ? o.subject : (findEntity(o.subject ?? "")?.id ?? null);
    } else {
      subject = findEntity(o.subject ?? "")?.id ?? null;
    }
    return { op: o.op, kind: o.kind, subject_entity: subject, content: o.content, source: o.source, polarity: o.polarity };
  });
  // Interest ops must point at a known entity, with one exception: something the fan explicitly SAYS they
  // follow (another sport, a player outside the dataset) is remembered as plain text. It can't steer
  // suggestions without data behind it, but the friend can acknowledge it and it shows on the memory page.
  const isFreeTextFollow = (o: MemoryOp) =>
    !o.subject_entity && o.kind === "stated_preference" && o.source === "stated" && (o.polarity ?? "positive") === "positive" && o.op !== "contradict" && o.content.trim().length > 3;
  const valid = ops
    .filter((o) => o.kind === "knowledge" || (o.subject_entity && !isConcept(o.subject_entity)) || isFreeTextFollow(o))
    .map((o) => (o.subject_entity ? o : { ...o, content: o.content.trim().slice(0, 90) }));
  return applyOps(user, valid, now);
}

/**
 * Raise the stored knowledge level when behaviour shows the fan has outgrown it
 * (e.g. they have learned enough concepts). Call after interactions; cheap and idempotent.
 */
export async function updateLevel(user: User, now: Date): Promise<MemoryChange[]> {
  const profile = await loadProfile(user, now);
  const ops: MemoryOp[] = [];
  // Each sport is judged on its own: concepts learned in that sport move that sport's level only.
  for (const sport of new Set(conceptEntities().map((e) => e.sport))) {
    const learnedHere = [...profile.learnedEntities].filter((id) => isConcept(id) && sportOfEntity(id) === sport).length;
    const current = levelFor(profile, sport);
    const next = nextLevel(current, learnedHere);
    if (next === current) continue;
    ops.push({
      op: "reinforce",
      kind: "knowledge",
      subject_entity: `level:${sport}`,
      content: `${next[0].toUpperCase()}${next.slice(1)} ${sport} follower`,
      source: "inferred",
    });
  }
  return applyOps(user, ops, now);
}
