/**
 * Memory rules — pure functions, no I/O, fully unit-tested.
 * The LLM only *proposes* memory operations; these rules decide what is stored.
 */
import type { EventType, Memory, MemoryKind, Polarity } from "../store/types";

/** A proposed change, from the LLM extractor or from a behaviour signal. */
export type MemoryOp = {
  op: "add" | "reinforce" | "contradict";
  kind: MemoryKind;
  subject_entity: string | null;
  content: string;
  source: "stated" | "inferred";
  polarity?: Polarity;
  /** Confidence boost for this op (signals pass their own weight). */
  weight?: number;
};

export type MemoryChange = { type: "created" | "updated" | "corrected"; memory: Memory };

const DAY = 86_400_000;
/** Half-life of an un-reinforced memory, by source. Stated facts fade far slower. */
const HALF_LIFE_DAYS = { stated: 120, inferred: 30 } as const;
export const FADED_BELOW = 0.15;
/** An inferred interest needs this much evidence before it can drive proactive nudges. */
export const NUDGE_MIN_EVIDENCE = 2;
export const NUDGE_MIN_CONFIDENCE = 0.25;

const INTEREST_KINDS: MemoryKind[] = ["stated_preference", "inferred_interest"];
const isInterest = (k: MemoryKind) => INTEREST_KINDS.includes(k);

/** Confidence after time decay since the last reinforcement. */
export function effectiveConfidence(m: Memory, now: Date): number {
  if (m.status === "corrected") return 0;
  const ageDays = Math.max(0, (now.getTime() - new Date(m.last_reinforced_at).getTime()) / DAY);
  return m.confidence * Math.pow(0.5, ageDays / HALF_LIFE_DAYS[m.source]);
}

/** Status as shown to the user (faded is derived on read, never stored destructively). */
export function displayStatus(m: Memory, now: Date): Memory["status"] {
  if (m.status === "corrected") return "corrected";
  return effectiveConfidence(m, now) < FADED_BELOW ? "faded" : "active";
}

/** Can this memory steer what the friend proactively brings up? */
export function canDriveNudges(m: Memory, now: Date): boolean {
  if (!isInterest(m.kind) || m.polarity !== "positive" || displayStatus(m, now) !== "active") return false;
  if (m.source === "stated") return true;
  return m.evidence_count >= NUDGE_MIN_EVIDENCE && effectiveConfidence(m, now) >= NUDGE_MIN_CONFIDENCE;
}

/**
 * Collapse changes from several steps of one interaction into the net result:
 * one entry per memory, and nothing for memories that were created and then
 * corrected within the same interaction (they were never visible to the user).
 */
export function collapseChanges(changes: MemoryChange[]): MemoryChange[] {
  const byId = new Map<string, MemoryChange>();
  for (const c of changes) {
    const prev = byId.get(c.memory.id);
    byId.set(c.memory.id, { type: prev?.type === "created" ? "created" : c.type, memory: c.memory });
  }
  return [...byId.values()].filter((c) => !(c.type === "created" && c.memory.status === "corrected"));
}

/** Behaviour signal → memory op (no LLM). */
export const SIGNAL_WEIGHTS: Record<EventType, number> = {
  picked_thread: 0.15,
  opened_story: 0.1,
  follow_up: 0.1,
  asked_moment: 0.1,
  viewed_player: 0.05,
  fantasy_pick: 0.1,
  dismissed_nudge: -0.15,
};

export function signalToOp(type: EventType, entityId: string, entityName: string): MemoryOp {
  return {
    op: "reinforce",
    kind: "inferred_interest",
    subject_entity: entityId,
    content: `Interested in ${entityName}`,
    source: "inferred",
    polarity: "positive",
    weight: SIGNAL_WEIGHTS[type],
  };
}

function findMatch(memories: Memory[], op: MemoryOp): Memory | undefined {
  const active = memories.filter((m) => m.status !== "corrected");
  if (op.subject_entity) {
    if (isInterest(op.kind)) {
      return active.find((m) => isInterest(m.kind) && m.subject_entity === op.subject_entity);
    }
    return active.find((m) => m.kind === op.kind && m.subject_entity === op.subject_entity);
  }
  const norm = (s: string) => s.trim().toLowerCase();
  return active.find((m) => m.kind === op.kind && !m.subject_entity && norm(m.content) === norm(op.content));
}

let counter = 0;
const newId = () => `m_${Date.now().toString(36)}_${(counter++).toString(36)}`;

/**
 * Apply proposed ops to the current memories. Returns only what changed.
 * Rules:
 *  - match by subject (interest kinds share one slot per entity) or by content
 *  - reinforce: evidence +1, confidence up, timestamp refreshed
 *  - stated beats inferred: an inferred interest the user then states becomes a stated preference
 *  - negative signals lower confidence; they never create a new memory
 *  - contradict: the matching memory is marked corrected; a negative stated preference records the correction
 */
export function reconcile(memories: Memory[], ops: MemoryOp[], userId: string, now: Date): MemoryChange[] {
  const working = memories.map((m) => ({ ...m }));
  const changes = new Map<string, MemoryChange>();
  const ts = now.toISOString();
  const record = (type: MemoryChange["type"], m: Memory) => {
    const prev = changes.get(m.id);
    changes.set(m.id, { type: prev?.type === "created" ? "created" : type, memory: m });
  };

  for (const op of ops) {
    const polarity = op.polarity ?? "positive";
    const weight = op.weight ?? (op.source === "stated" ? 0.3 : 0.15);
    const existing = findMatch(working, op);

    if (op.op === "contradict") {
      if (existing) {
        existing.status = "corrected";
        existing.confidence = 0;
        record("corrected", existing);
      }
      if (op.subject_entity && isInterest(op.kind)) {
        const neg: Memory = {
          id: newId(),
          user_id: userId,
          kind: "stated_preference",
          subject_entity: op.subject_entity,
          content: op.content,
          source: "stated",
          confidence: 0.9,
          evidence_count: 1,
          last_reinforced_at: ts,
          status: "active",
          polarity: "negative",
          created_at: ts,
        };
        working.push(neg);
        record("created", neg);
      }
      continue;
    }

    if (existing) {
      // A stated negative preference can only be undone by an explicit stated positive.
      if (existing.polarity === "negative" && !(op.source === "stated" && polarity === "positive")) continue;

      if (weight < 0) {
        existing.confidence = Math.max(0, existing.confidence + weight);
      } else {
        existing.evidence_count += 1;
        existing.confidence = Math.min(1, existing.confidence + weight);
        existing.last_reinforced_at = ts;
      }
      if (op.source === "stated" && existing.source === "inferred") {
        existing.source = "stated";
        existing.confidence = Math.max(existing.confidence, 0.9);
        if (isInterest(existing.kind)) existing.kind = "stated_preference";
        existing.content = op.content;
      }
      if (op.source === "stated" && polarity === "positive" && existing.polarity === "negative") {
        existing.polarity = "positive";
        existing.content = op.content;
      }
      if (op.kind === "knowledge" && op.content !== existing.content) {
        existing.content = op.content;
        existing.source = op.source; // an inferred update to something the fan stated is no longer "told"
      }
      record("updated", existing);
      continue;
    }

    if (weight < 0) continue; // nothing to weaken

    const kind: MemoryKind = isInterest(op.kind)
      ? op.source === "stated"
        ? "stated_preference"
        : "inferred_interest"
      : op.kind;
    const created: Memory = {
      id: newId(),
      user_id: userId,
      kind,
      subject_entity: op.subject_entity,
      content: op.content,
      source: op.source,
      confidence: op.source === "stated" ? 0.9 : Math.min(0.6, 0.2 + weight),
      evidence_count: 1,
      last_reinforced_at: ts,
      status: "active",
      polarity,
      created_at: ts,
    };
    working.push(created);
    record("created", created);
  }
  return [...changes.values()];
}

export type Level = "new" | "casual" | "regular" | "expert";

/** Concepts a fan must have learned before the friend assumes more knowledge. */
export const LEVEL_UP_AT = { new: 3, casual: 8 } as const;

/**
 * The level behaviour implies. Only ever moves up one step at a time, never down on its own,
 * and never reaches "expert" automatically (that must be stated by the fan).
 */
export function nextLevel(current: Level, learnedConcepts: number): Level {
  if (current === "new" && learnedConcepts >= LEVEL_UP_AT.new) return "casual";
  if (current === "casual" && learnedConcepts >= LEVEL_UP_AT.casual) return "regular";
  return current;
}
