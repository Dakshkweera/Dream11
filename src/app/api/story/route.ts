import { after } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { PageContext } from "@/lib/friend/context";
import { getEntity } from "@/lib/facts/retrieve";
import { collapseChanges } from "@/lib/memory/rules";
import { recordSignal, rememberDiscovery, updateLevel } from "@/lib/memory/service";
import { getStore } from "@/lib/store";
import { prefetchResearch, storyFor } from "@/lib/story/pregenerate";

export const maxDuration = 60;

const Body = z.object({
  entityId: z.string(),
  angle: z.string().max(400).optional(),
  fromThread: z.boolean().optional(), // user tapped a "go deeper" thread
  context: PageContext.optional(),
});

export const POST = route(
  Body,
  async ({ user, now, body }) => {
    const entity = getEntity(body.entityId);
    if (!entity) return Response.json({ error: "Unknown topic" }, { status: 404 });

    // Instant when the story was already written in the background for a nudge.
    const { value: story, hit } = await storyFor(user, body.entityId, body.angle, body.context, now);

    const store = getStore();
    await store.addMessage({ user_id: user.id, role: "assistant", content: story.body, story, context: body.context ?? null });
    await store.setDiscoveryOutcome(user.id, body.entityId, "opened");

    const changes = [
      ...(await recordSignal(user, body.fromThread ? "picked_thread" : "opened_story", body.entityId, now)),
      ...(await rememberDiscovery(user, body.entityId, story.title, now)),
      ...(await updateLevel(user, now)),
    ];
    const memory = collapseChanges(changes).map((c) => ({ type: c.type, content: c.memory.content, source: c.memory.source, kind: c.memory.kind }));
    // Warm up the research behind the "Go deeper" buttons while the fan reads.
    after(() => prefetchResearch(user, story.threads.map((t) => t.entityId)));
    return { story, memory, cached: hit };
  },
  { max: 20 },
);
