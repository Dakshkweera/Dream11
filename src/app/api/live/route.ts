import { z } from "zod";
import { route } from "@/lib/api";
import { PageContext } from "@/lib/friend/context";
import { liveComment } from "@/lib/friend/service";

export const maxDuration = 45;

const Body = z.object({ context: PageContext, sessionId: z.string().max(80) });

export const POST = route(Body, async ({ user, now, body }) => {
  const out = await liveComment(user, body.context, body.sessionId, now);
  return { comment: out?.comment ?? null, entityId: out?.entityId ?? null };
}, { max: 40 });
