import { z } from "zod";
import { route } from "@/lib/api";
import { PageContext } from "@/lib/friend/context";
import { buildSuggestions } from "@/lib/friend/suggestions";
import { loadProfile } from "@/lib/memory/service";
import { getStore } from "@/lib/store";

const Body = z.object({ context: PageContext.optional() });

/** Suggestion chips chosen from the fan's memory and the current page — no AI call, instant. */
export const POST = route(Body, async ({ user, now, body }) => {
  const [profile, recent] = await Promise.all([loadProfile(user, now), getStore().listDiscoveries(user.id, 20)]);
  const suggestions = buildSuggestions({
    profile,
    onScreen: body.context?.entityIds ?? [],
    recentlyDiscussed: recent.map((d) => d.entity_id),
  });
  return { suggestions };
});
