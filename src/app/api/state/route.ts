import { route } from "@/lib/api";
import { loadProfile } from "@/lib/memory/service";

/** Lightweight session state for the shell: onboarded?, level, how many interests. */
export const GET = route(null, async ({ user, now }) => {
  const p = await loadProfile(user, now);
  return { onboarded: user.onboarded, name: user.display_name, level: p.level, interests: p.interests.length, daysShifted: user.clock_offset_days };
});
