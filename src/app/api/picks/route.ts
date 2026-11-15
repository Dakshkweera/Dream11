import { z } from "zod";
import { route } from "@/lib/api";
import { getStore } from "@/lib/store";

const MAX_PICKS = 11;

export const GET = route(null, async ({ user }) => ({ picks: await getStore().listPicks(user.id) }));

const Body = z.object({ key: z.string().min(1).max(80), picked: z.boolean() });

/**
 * Pick or drop a player for the fan's fantasy team. Picks live in their own list (not as memories),
 * and feed discovery and the friend's prompts through the profile.
 */
export const POST = route(Body, async ({ user, now, body }) => {
  const store = getStore();
  const current = await store.listPicks(user.id);
  if (body.picked && !current.includes(body.key) && current.length >= MAX_PICKS) {
    return Response.json({ error: `Your team is full (${MAX_PICKS} players). Drop someone first.` }, { status: 409 });
  }
  await store.setPick(user.id, body.key, body.picked);
  if (body.picked) {
    await store.addEvent({ user_id: user.id, type: "fantasy_pick", entity_id: body.key, created_at: now.toISOString() });
  }
  return { picks: await store.listPicks(user.id) };
});
