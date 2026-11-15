import { describe, expect, it } from "vitest";
import { createCache, storyKey } from "./cache";

describe("createCache", () => {
  it("returns the cached value on the second call", async () => {
    const c = createCache<string>({ ttlMs: 1000, max: 10 });
    let calls = 0;
    const make = async () => `v${++calls}`;
    const a = await c.getOrCreate("k", make);
    const b = await c.getOrCreate("k", make);
    expect(a).toEqual({ value: "v1", hit: false });
    expect(b).toEqual({ value: "v1", hit: true });
  });

  it("shares one AI call between concurrent requests", async () => {
    const c = createCache<string>({ ttlMs: 1000, max: 10 });
    let calls = 0;
    const make = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return "story";
    };
    const [a, b, d] = await Promise.all([c.getOrCreate("k", make), c.getOrCreate("k", make), c.getOrCreate("k", make)]);
    expect(calls).toBe(1);
    expect([a.value, b.value, d.value]).toEqual(["story", "story", "story"]);
  });

  it("expires entries after the TTL", async () => {
    let t = 0;
    const c = createCache<string>({ ttlMs: 1000, max: 10, now: () => t });
    let calls = 0;
    const make = async () => `v${++calls}`;
    await c.getOrCreate("k", make);
    t = 999;
    expect((await c.getOrCreate("k", make)).hit).toBe(true);
    t = 1001;
    expect(await c.getOrCreate("k", make)).toEqual({ value: "v2", hit: false });
  });

  it("does not cache failures, so a retry works", async () => {
    const c = createCache<string>({ ttlMs: 1000, max: 10 });
    let calls = 0;
    const flaky = async () => {
      if (++calls === 1) throw new Error("boom");
      return "ok";
    };
    await expect(c.getOrCreate("k", flaky)).rejects.toThrow("boom");
    expect(await c.getOrCreate("k", flaky)).toEqual({ value: "ok", hit: false });
  });

  it("does not keep values the caller rejects (e.g. fallback stories)", async () => {
    const c = createCache<{ grounded: boolean }>({ ttlMs: 1000, max: 10 });
    await c.getOrCreate("k", async () => ({ grounded: false }), (s) => s.grounded);
    expect(c.has("k")).toBe(false);
  });

  it("evicts the oldest entry beyond max", async () => {
    const c = createCache<number>({ ttlMs: 1000, max: 2 });
    for (const k of ["a", "b", "c"]) await c.getOrCreate(k, async () => 1);
    expect(c.size()).toBe(2);
    expect(c.has("a")).toBe(false);
  });
});

describe("storyKey", () => {
  const k = (over: Partial<{ u: string; e: string; a: string | undefined; p: string; l: string }> = {}) =>
    storyKey(over.u ?? "u1", over.e ?? "player:ms-dhoni", "a" in over ? over.a : "angle", over.p ?? "profile", over.l ?? "casual");

  it("is stable for the same inputs", () => expect(k()).toBe(k()));
  it("changes with the fan, topic, angle, profile or level", () => {
    const base = k();
    for (const other of [k({ u: "u2" }), k({ e: "team:csk" }), k({ a: "different" }), k({ a: undefined }), k({ p: "profile changed" }), k({ l: "expert" })]) {
      expect(other).not.toBe(base);
    }
  });
});
