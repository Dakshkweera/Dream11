import { z } from "zod";
import { route } from "@/lib/api";
import { applyStatedOps } from "@/lib/memory/service";
import { getStore } from "@/lib/store";

const Body = z.object({
  action: z.enum(["later", "reset", "riya"]),
  days: z.number().int().min(1).max(60).optional(),
});

/** Demo controls: simulate time passing, reset the user, or load the "Riya" persona. */
export const POST = route(Body, async ({ user, body }) => {
  const store = getStore();
  if (body.action === "later") {
    await store.updateUser(user.id, { clock_offset_days: user.clock_offset_days + (body.days ?? 7) });
  } else {
    await store.resetUser(user.id);
    if (body.action === "riya") {
      await applyStatedOps(
        user,
        [
          { op: "add", kind: "stated_preference", subject_entity: "player:virat-kohli", content: "Follows Virat Kohli", source: "stated" },
          { op: "add", kind: "knowledge", subject_entity: "level:cricket", content: "Casual follower", source: "stated" },
        ],
        new Date(),
      );
      await store.updateUser(user.id, { onboarded: true, display_name: "Riya" });
    }
  }
  return { ok: true };
});
