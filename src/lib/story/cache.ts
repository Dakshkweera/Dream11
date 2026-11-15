/**
 * Small in-memory cache with request de-duplication, used so a story that was pre-generated for a
 * nudge is ready the moment the fan taps it, and concurrent requests for the same story share one AI call.
 * Per server instance and best-effort: a miss just generates normally.
 */
export type Cache<T> = {
  getOrCreate(key: string, make: () => Promise<T>, keep?: (value: T) => boolean): Promise<{ value: T; hit: boolean }>;
  has(key: string): boolean;
  size(): number;
};

export function createCache<T>(opts: { ttlMs: number; max: number; now?: () => number }): Cache<T> {
  const now = opts.now ?? Date.now;
  const entries = new Map<string, { at: number; value: Promise<T> }>();

  const fresh = (key: string) => {
    const e = entries.get(key);
    if (!e) return undefined;
    if (now() - e.at > opts.ttlMs) {
      entries.delete(key);
      return undefined;
    }
    return e;
  };

  return {
    async getOrCreate(key, make, keep = () => true) {
      const existing = fresh(key);
      if (existing) {
        try {
          return { value: await existing.value, hit: true };
        } catch {
          entries.delete(key); // the shared attempt failed; fall through and try again
        }
      }
      const value = make();
      entries.set(key, { at: now(), value });
      if (entries.size > opts.max) entries.delete(entries.keys().next().value!);
      try {
        const done = await value;
        if (!keep(done)) entries.delete(key); // e.g. a safe-fallback story shouldn't be reused
        return { value: done, hit: false };
      } catch (e) {
        entries.delete(key);
        throw e;
      }
    },
    has: (key) => !!fresh(key),
    size: () => entries.size,
  };
}

/** A short stable hash (djb2) — enough to tell profiles apart in a cache key. */
export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Same fan, same profile, same topic and angle → same key. Any change to the profile makes a new key. */
export function storyKey(userId: string, entityId: string, angle: string | undefined, profileText: string, level: string): string {
  return `${userId}|${entityId}|${hash(angle ?? "")}|${hash(`${level}\n${profileText}`)}`;
}
