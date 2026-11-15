import { z } from "zod";
import { route } from "@/lib/api";
import { recordSignal } from "@/lib/memory/service";
import { getStore } from "@/lib/store";

const Body = z.object({
  type: z.enum(["viewed_player", "dismissed_nudge", "asked_moment", "fantasy_pick"]),
  entityId: z.string(),
});

export const POST = route(Body, async ({ user, now, body }) => {
  if (body.type === "dismissed_nudge") await getStore().setDiscoveryOutcome(user.id, body.entityId, "dismissed");
  const changes = await recordSignal(user, body.type, body.entityId, now);
  return { changed: changes.length };
});
