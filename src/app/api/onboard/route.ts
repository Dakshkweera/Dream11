import { z } from "zod";
import { route } from "@/lib/api";
import { findEntity } from "@/lib/facts/retrieve";
import { applyStatedOps, recordSignal } from "@/lib/memory/service";
import type { MemoryOp } from "@/lib/memory/rules";
import { getStore } from "@/lib/store";

const Level = z.enum(["new", "casual", "regular", "expert"]);
const SportAnswer = z.object({
  sport: z.string().regex(/^[a-z-]{2,30}$/),
  level: Level,
  follows: z.array(z.string().max(60)).max(8),
});

const Body = z.object({
  /** One answer per sport the fan picked: how well they know it and who they follow in it. */
  sports: z.array(SportAnswer).max(6).optional(),
  /** Sports the fan named that the app has no data for. Kept as plain stated interests. */
  other: z.array(z.string().trim().min(1).max(40)).max(4).optional(),
  /** Older shape: cricket only. */
  follows: z.array(z.string().max(60)).max(8).optional(),
  level: Level.optional(),
  fantasyPicks: z.array(z.string()).max(11).optional(),
});

export const POST = route(Body, async ({ user, now, body }) => {
  const answers = body.sports ?? (body.level ? [{ sport: "cricket", level: body.level, follows: body.follows ?? [] }] : []);
  const unknown: string[] = [];
  const ops: MemoryOp[] = [];

  for (const a of answers) {
    for (const raw of a.follows) {
      const e = findEntity(raw);
      if (e) ops.push({ op: "add", kind: "stated_preference", subject_entity: e.id, content: `Follows ${e.name}`, source: "stated" });
      else {
        // Someone we have no data on: still remember it, just without a graph to explore from.
        unknown.push(raw);
        ops.push({ op: "add", kind: "stated_preference", subject_entity: null, content: `Follows ${raw}`, source: "stated" });
      }
    }
    ops.push({
      op: "add",
      kind: "knowledge",
      subject_entity: `level:${a.sport}`,
      content: `${a.level[0].toUpperCase()}${a.level.slice(1)} ${a.sport} follower`,
      source: "stated",
    });
  }
  for (const s of body.other ?? []) ops.push({ op: "add", kind: "stated_preference", subject_entity: null, content: `Follows ${s}`, source: "stated" });

  await applyStatedOps(user, ops, now);
  for (const id of body.fantasyPicks ?? []) await recordSignal(user, "fantasy_pick", id, now);
  await getStore().updateUser(user.id, { onboarded: true });
  return { ok: true, unknown };
});
