import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(resetRateLimits);

  it("allows up to the limit, then blocks with a retry time", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("u1:chat", 3, 60_000, 1000 + i).ok).toBe(true);
    const r = rateLimit("u1:chat", 3, 60_000, 2000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("frees capacity as the window slides", () => {
    for (let i = 0; i < 3; i++) rateLimit("u1:chat", 3, 60_000, 1000);
    expect(rateLimit("u1:chat", 3, 60_000, 30_000).ok).toBe(false);
    expect(rateLimit("u1:chat", 3, 60_000, 61_001).ok).toBe(true);
  });

  it("limits each user and each route separately", () => {
    for (let i = 0; i < 3; i++) rateLimit("u1:chat", 3, 60_000, 1000);
    expect(rateLimit("u1:chat", 3, 60_000, 1001).ok).toBe(false);
    expect(rateLimit("u2:chat", 3, 60_000, 1001).ok).toBe(true);
    expect(rateLimit("u1:story", 3, 60_000, 1001).ok).toBe(true);
  });
});
