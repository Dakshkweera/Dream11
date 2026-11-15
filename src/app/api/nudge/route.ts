import { after } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { PageContext } from "@/lib/friend/context";
import { proposeNudge } from "@/lib/friend/service";
import { pregenerateStory } from "@/lib/story/pregenerate";

export const maxDuration = 60;

const Body = z.object({
  surface: z.enum(["home", "match", "player"]),
  sessionId: z.string().max(80),
  context: PageContext.optional(),
  focusEntity: z.string().optional(),
});

export const POST = route(
  Body,
  async ({ user, now, body }) => {
    const nudge = await proposeNudge(user, body.surface, body.context, body.sessionId, now, { focusEntity: body.focusEntity });
    // Write the story behind the nudge in the background so tapping "Tell me" is instant.
    if (nudge) after(() => pregenerateStory(user, nudge.entityId, nudge.angle, body.context, now));
    return { nudge };
  },
  { max: 30 },
);
