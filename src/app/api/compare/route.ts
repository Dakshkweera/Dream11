import { z } from "zod";
import { route } from "@/lib/api";
import { rankDiscoveries } from "@/lib/discovery/select";
import { getEntity, neighbours } from "@/lib/facts/retrieve";
import { PageContext } from "@/lib/friend/context";
import { buildSuggestions } from "@/lib/friend/suggestions";
import { loadProfile, type Profile } from "@/lib/memory/service";

const Body = z.object({ context: PageContext.optional() });

const emptyProfile = (): Profile => ({
  memories: [],
  interests: [],
  negatives: new Set(),
  level: "casual",
  levels: {},
  learned: [],
  learnedEntities: new Set(),
  discoveries: [],
  picks: [],
});

const name = (id: string) => getEntity(id)?.name ?? id;

function view(profile: Profile, onScreen: string[]) {
  const ranked = rankDiscoveries({
    interests: profile.interests,
    negatives: profile.negatives,
    onScreen,
    recentlyDiscussed: [],
    neighbours: (id) => neighbours(id).map((n) => ({ entityId: n.entity.id, relation: n.relation.type, type: n.entity.type })),
  });
  return {
    chips: buildSuggestions({ profile, onScreen, recentlyDiscussed: [] }),
    next: ranked.slice(0, 3).map((c) => ({
      topic: name(c.entityId),
      why: c.because.fromEntity && c.because.relation !== "on_screen" ? `because ${name(c.because.fromEntity)} matters to you` : "it's on screen",
    })),
  };
}

/** The same screen for a brand-new fan and for this fan — shows what the memory changes. No AI call. */
export const POST = route(Body, async ({ user, now, body }) => {
  const onScreen = body.context?.entityIds ?? [];
  const profile = await loadProfile(user, now);
  return { level: profile.level, newFan: view(emptyProfile(), onScreen), you: view(profile, onScreen) };
});
