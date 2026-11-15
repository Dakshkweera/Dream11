/**
 * Per-user sliding-window rate limit, in memory.
 * Protects the OpenRouter budget when the app is public. On serverless each instance keeps its own
 * counters, so this is a guardrail against runaway clients, not a hard guarantee.
 */
const hits = new Map<string, number[]>();

export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): LimitResult {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.delete(hits.keys().next().value!); // bound memory
  return { ok: true };
}

/** Test helper. */
export function resetRateLimits() {
  hits.clear();
}
