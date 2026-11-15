import { contextToPrompt, type PageContext } from "../friend/context";
import { sportOfEntity } from "../facts/concepts";
import { levelFor, loadProfile, profileToPrompt } from "../memory/service";
import type { User } from "../store";
import { rateLimit } from "../rate-limit";
import { createCache, storyKey } from "./cache";
import { generateStory, type Story } from "./generate";
import { research } from "./research";

/** Stories are reused for 20 minutes as long as the fan's profile hasn't changed. */
export const stories = createCache<Story>({ ttlMs: 20 * 60_000, max: 300 });

/** The one place a story request is turned into a cache key and a generation call. */
export async function storyFor(user: User, entityId: string, angle: string | undefined, ctx: PageContext | undefined, now: Date) {
  const profile = await loadProfile(user, now);
  const sport = sportOfEntity(entityId);
  const profileText = profileToPrompt(profile, now, sport); // only this sport's interests: no forced cross-sport analogies
  const level = levelFor(profile, sport);
  const key = storyKey(user.id, entityId, angle, profileText, level);
  return stories.getOrCreate(
    key,
    async () =>
      generateStory({
        entityId,
        angle,
        profileText,
        level,
        context: contextToPrompt(ctx),
        alsoEntities: profile.interests.slice(0, 3).map((i) => i.entityId),
        // Before writing, find extra facts on the web. Cached for everyone; at most 15 new searches per fan per 10 min.
        extraFacts: await research(entityId, { allowNew: () => rateLimit(`${user.id}:research`, 15, 600_000).ok }),
      }),
    (s) => s.grounded, // never reuse the plain-facts fallback
  );
}

/**
 * After a story is shown, quietly research the topics its "Go deeper" buttons lead to, so tapping one is about
 * twice as fast (the search is the slow part). Cached for everyone; counts against the fan's research limit;
 * turned off with PREGENERATE_STORIES=0.
 */
export async function prefetchResearch(user: User, entityIds: string[]) {
  if (process.env.PREGENERATE_STORIES === "0") return;
  await Promise.all(
    entityIds.map((id) => research(id, { allowNew: () => rateLimit(`${user.id}:research`, 15, 600_000).ok }).catch(() => [])),
  );
}

/**
 * Write the story behind a nudge in the background, so tapping it is instant.
 * Costs one extra AI call per nudge shown, whether or not it's tapped; turn off with PREGENERATE_STORIES=0.
 */
export async function pregenerateStory(user: User, entityId: string, angle: string | undefined, ctx: PageContext | undefined, now: Date) {
  if (process.env.PREGENERATE_STORIES === "0") return;
  try {
    await storyFor(user, entityId, angle, ctx, now);
  } catch (e) {
    console.warn("[pregenerate] failed:", (e as Error).message); // harmless: tapping will generate normally
  }
}
