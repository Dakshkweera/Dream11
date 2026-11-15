import { z } from "zod";
import { route } from "@/lib/api";
import { getEntity } from "@/lib/facts/retrieve";
import { displayStatus, effectiveConfidence } from "@/lib/memory/rules";
import { applyStatedOps } from "@/lib/memory/service";
import { getStore } from "@/lib/store";

export const GET = route(null, async ({ user, now }) => {
  const store = getStore();
  const [memories, picks] = await Promise.all([store.listMemories(user.id), store.listPicks(user.id)]);
  return {
    picks: picks.map((k) => (k.startsWith("name:") ? k.slice(5) : (getEntity(k)?.name ?? k))),
    memories: memories
      .filter((m) => m.status !== "corrected")
      .map((m) => ({
        id: m.id,
        kind: m.kind,
        content: m.content,
        source: m.source,
        polarity: m.polarity,
        entity: m.subject_entity ? (getEntity(m.subject_entity)?.name ?? null) : null,
        evidence: m.evidence_count,
        strength: Math.round(effectiveConfidence(m, now) * 100) / 100,
        status: displayStatus(m, now),
        lastReinforced: m.last_reinforced_at,
      }))
      .sort((a, b) => b.strength - a.strength),
  };
});

const Delete = z.object({ id: z.string() });
export const DELETE = route(Delete, async ({ user, body }) => {
  await getStore().deleteMemory(user.id, body.id);
});

/** "Not right": the memory is corrected, and for an interest the fan's rejection is remembered. */
const Wrong = z.object({ id: z.string() });
export const PATCH = route(Wrong, async ({ user, now, body }) => {
  const store = getStore();
  const mem = (await store.listMemories(user.id)).find((m) => m.id === body.id);
  if (!mem) return Response.json({ error: "Not found" }, { status: 404 });
  if (mem.subject_entity && (mem.kind === "inferred_interest" || mem.kind === "stated_preference")) {
    const name = getEntity(mem.subject_entity)?.name ?? "that";
    await applyStatedOps(
      user,
      [{ op: "contradict", kind: mem.kind, subject_entity: mem.subject_entity, content: `Not into ${name}`, source: "stated", polarity: "negative" }],
      now,
    );
  } else {
    await store.saveMemory({ ...mem, status: "corrected", confidence: 0 });
  }
});
