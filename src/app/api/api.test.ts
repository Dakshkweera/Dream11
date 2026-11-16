/**
 * Route-level tests: the real handlers, storage, validation and rate limiting, with Next's request
 * context (cookies, connection) stubbed. None of these call the AI, so they run for free and offline.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ uid: "" }));
const dir = mkdtempSync(join(tmpdir(), "sf-api-"));
process.env.STORE = "file";
process.env.STORE_DIR = dir;

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "sf_uid" ? { value: h.uid } : undefined) }),
}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), connection: async () => {}, after: () => {} }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

import { resetRateLimits } from "@/lib/rate-limit";

afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  h.uid = `u_${Math.random().toString(36).slice(2, 10)}`;
  resetRateLimits();
});

const req = (path: string, method = "GET", body?: unknown) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async (r: Response) => (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(path: string, mod: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown) {
  const routes = (await import(/* @vite-ignore */ mod)) as Record<string, (r: Request) => Promise<Response>>;
  return routes[method](req(path, method, body));
}
const R = (name: string) => `@/app/api/${name}/route`;

describe("player statistics", () => {
  it("returns a scorecard with photos, and a plain 'none' (not an error) for a match without statistics", async () => {
    const card = await call("/api/stats?match=rcb-vs-pbks", R("stats"), "GET");
    expect(card.status).toBe(200);
    const d = await json(card);
    expect(d.stats.cricket.innings).toHaveLength(2);
    expect(d.portraits["player:virat-kohli"].license).toBeTruthy();
    const none = await call("/api/stats?match=rcb-vs-csk", R("stats"), "GET");
    expect(none.status).toBe(200);
    expect((await json(none)).stats).toBeNull();
  });

  it("lists a player's matches with match labels, and rejects a request with no query", async () => {
    const d = await json(await call("/api/stats?player=player:virat-kohli", R("stats"), "GET"));
    expect(d.records.map((r: { matchId: string }) => r.matchId).sort()).toEqual(["rcb-vs-gt", "rcb-vs-pbks"]);
    expect(d.records[0].match.title).toBeTruthy();
    expect((await call("/api/stats", R("stats"), "GET")).status).toBe(400);
  });
});

describe("picks", () => {
  it("saves, lists and removes picks", async () => {
    await call("/api/picks", R("picks"), "POST", { key: "player:ms-dhoni", picked: true });
    await call("/api/picks", R("picks"), "POST", { key: "name:Phil Salt", picked: true });
    expect((await json(await call("/api/picks", R("picks"), "GET"))).picks.sort()).toEqual(["name:Phil Salt", "player:ms-dhoni"]);
    await call("/api/picks", R("picks"), "POST", { key: "player:ms-dhoni", picked: false });
    expect((await json(await call("/api/picks", R("picks"), "GET"))).picks).toEqual(["name:Phil Salt"]);
  });

  it("refuses a 12th player with a clear message", async () => {
    for (let i = 0; i < 11; i++) await call("/api/picks", R("picks"), "POST", { key: `name:P${i}`, picked: true });
    const r = await call("/api/picks", R("picks"), "POST", { key: "name:One too many", picked: true });
    expect(r.status).toBe(409);
    expect((await json(r)).error).toMatch(/full/i);
    // dropping one frees a slot
    await call("/api/picks", R("picks"), "POST", { key: "name:P0", picked: false });
    expect((await call("/api/picks", R("picks"), "POST", { key: "name:One too many", picked: true })).status).toBe(200);
  });
});

describe("onboarding and memory", () => {
  it("turns onboarding answers into stated memories and reports names it doesn't know", async () => {
    const r = await json(await call("/api/onboard", R("onboard"), "POST", { follows: ["Virat Kohli", "Nobody Atall"], level: "casual" }));
    expect(r.unknown).toEqual(["Nobody Atall"]);
    const mem = (await json(await call("/api/memory", R("memory"), "GET"))).memories as { content: string; source: string }[];
    expect(mem.map((m) => m.content)).toEqual(expect.arrayContaining(["Follows Virat Kohli", "Casual cricket follower"]));
    expect(mem.every((m) => m.source === "stated")).toBe(true);
    expect((await json(await call("/api/state", R("state"), "GET"))).onboarded).toBe(true);
  });

  it("onboards several sports, each with its own level, plus a sport we have no data for", async () => {
    const r = await json(
      await call("/api/onboard", R("onboard"), "POST", {
        sports: [
          { sport: "cricket", level: "regular", follows: ["Virat Kohli"] },
          { sport: "basketball", level: "new", follows: ["Stephen Curry", "Some Rookie"] },
        ],
        other: ["Football"],
      }),
    );
    expect(r.unknown).toEqual(["Some Rookie"]);
    const mem = (await json(await call("/api/memory", R("memory"), "GET"))).memories as { content: string }[];
    expect(mem.map((m) => m.content)).toEqual(
      expect.arrayContaining(["Follows Virat Kohli", "Follows Stephen Curry", "Follows Some Rookie", "Follows Football", "Regular cricket follower", "New basketball follower"]),
    );
  });

  it("serves the sports the onboarding can ask about, each with its own people", async () => {
    const { sports } = await json(await call("/api/catalog", R("catalog"), "GET"));
    const ids = sports.map((s: { id: string }) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["cricket", "basketball"]));
    const bb = sports.find((s: { id: string }) => s.id === "basketball");
    expect(bb.follow.map((c: { value: string }) => c.value)).toContain("Stephen Curry");
    expect(bb.follow.map((c: { value: string }) => c.value)).not.toContain("Virat Kohli");
  });

  it("deletes a memory", async () => {
    await call("/api/onboard", R("onboard"), "POST", { follows: ["Virat Kohli"], level: "casual" });
    const before = (await json(await call("/api/memory", R("memory"), "GET"))).memories as { id: string; content: string }[];
    const kohli = before.find((m) => m.content === "Follows Virat Kohli")!;
    await call("/api/memory", R("memory"), "DELETE", { id: kohli.id });
    const after = (await json(await call("/api/memory", R("memory"), "GET"))).memories as { content: string }[];
    expect(after.some((m) => m.content === "Follows Virat Kohli")).toBe(false);
  });

  it("'that's not right' replaces an interest with a remembered rejection", async () => {
    await call("/api/onboard", R("onboard"), "POST", { follows: ["Chennai Super Kings"], level: "casual" });
    const before = (await json(await call("/api/memory", R("memory"), "GET"))).memories as { id: string; content: string }[];
    await call("/api/memory", R("memory"), "PATCH", { id: before.find((m) => m.content.includes("Chennai"))!.id });
    const after = (await json(await call("/api/memory", R("memory"), "GET"))).memories as { content: string; polarity: string }[];
    expect(after.some((m) => m.content === "Follows Chennai Super Kings")).toBe(false);
    expect(after.find((m) => m.polarity === "negative")?.content).toMatch(/Not into Chennai/);
  });

  it("returns 404 when correcting a memory that doesn't exist", async () => {
    expect((await call("/api/memory", R("memory"), "PATCH", { id: "nope" })).status).toBe(404);
  });
});

describe("demo controls", () => {
  it("loads Riya, moves time forward, then resets", async () => {
    await call("/api/demo", R("demo"), "POST", { action: "riya" });
    let s = await json(await call("/api/state", R("state"), "GET"));
    expect(s).toMatchObject({ onboarded: true, name: "Riya", daysShifted: 0 });
    await call("/api/demo", R("demo"), "POST", { action: "later", days: 7 });
    s = await json(await call("/api/state", R("state"), "GET"));
    expect(s.daysShifted).toBe(7);
    await call("/api/demo", R("demo"), "POST", { action: "reset" });
    s = await json(await call("/api/state", R("state"), "GET"));
    expect(s).toMatchObject({ onboarded: false, daysShifted: 0 });
    expect((await json(await call("/api/memory", R("memory"), "GET"))).memories).toEqual([]);
  });
});

describe("personalisation without the AI", () => {
  it("suggestions and the comparison view differ between a new fan and a fan with memory", async () => {
    const ctx = { context: { surface: "home", entityIds: [] } };
    const fresh = await json(await call("/api/compare", R("compare"), "POST", ctx));
    expect(fresh.you.chips).toEqual(fresh.newFan.chips); // no memory yet → identical

    await call("/api/onboard", R("onboard"), "POST", { follows: ["Rohit Sharma"], level: "new" });
    const learned = await json(await call("/api/compare", R("compare"), "POST", ctx));
    expect(learned.you.chips).not.toEqual(learned.newFan.chips);
    expect(learned.you.next[0].why).toMatch(/Rohit Sharma matters to you/);
    expect(learned.level).toBe("new");

    const sug = await json(await call("/api/suggestions", R("suggestions"), "POST", ctx));
    expect(sug.suggestions.length).toBeGreaterThan(0);
  });

  it("offers onboarding options straight from the dataset", async () => {
    const { follow } = await json(await call("/api/catalog", R("catalog"), "GET"));
    expect(follow.map((f: { value: string }) => f.value)).toEqual(expect.arrayContaining(["Virat Kohli", "Chennai Super Kings"]));
  });
});

describe("validation and limits", () => {
  it("rejects malformed bodies with 400", async () => {
    expect((await call("/api/picks", R("picks"), "POST", { nonsense: true })).status).toBe(400);
    expect((await call("/api/onboard", R("onboard"), "POST", { follows: [], level: "genius" })).status).toBe(400);
  });

  it("answers 404 for an unknown story topic without calling the AI", async () => {
    expect((await call("/api/story", R("story"), "POST", { entityId: "player:nobody" })).status).toBe(404);
  });

  it("rate-limits a client that hammers a route, with a retry hint", async () => {
    let last!: Response;
    for (let i = 0; i < 125; i++) last = await call("/api/picks", R("picks"), "GET");
    expect(last.status).toBe(429);
    expect(last.headers.get("Retry-After")).toBeTruthy();
    expect((await json(last)).error).toMatch(/try again/i);
    // a different user is unaffected
    h.uid = "someone_else";
    expect((await call("/api/picks", R("picks"), "GET")).status).toBe(200);
  });

  it("rejects an empty audio upload", async () => {
    const routes = await import("@/app/api/transcribe/route");
    const form = new FormData();
    form.append("matchId", "rcb-vs-csk");
    const r = await routes.POST(new Request("http://localhost/api/transcribe", { method: "POST", body: form }));
    expect(r.status).toBe(400);
  });
});
