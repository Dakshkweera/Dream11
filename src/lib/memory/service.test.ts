import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "sf-mem-"));
process.env.STORE = "file";
process.env.STORE_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const now = new Date("2026-11-14T10:00:00Z");

async function setup() {
  const { getStore } = await import("../store");
  const { recordSignal, loadProfile, updateLevel, applyStatedOps } = await import("./service");
  const store = getStore();
  const user = await store.ensureUser(`u_${Math.random().toString(36).slice(2, 8)}`);
  return { store, user, recordSignal, loadProfile, updateLevel, applyStatedOps };
}

describe("signals and concepts", () => {
  it("asking about a player creates an inferred interest", async () => {
    const { user, recordSignal, store } = await setup();
    await recordSignal(user, "follow_up", "player:ms-dhoni", now);
    const mems = await store.listMemories(user.id);
    expect(mems.map((m) => m.subject_entity)).toContain("player:ms-dhoni");
  });

  it("asking what a concept means does NOT create an interest in it", async () => {
    const { user, recordSignal, store } = await setup();
    for (const id of ["topic:yorker", "topic:dls", "topic:finisher", "topic:orange-cap"]) {
      expect(await recordSignal(user, "follow_up", id, now)).toEqual([]);
    }
    expect(await store.listMemories(user.id)).toEqual([]);
  });
});

describe("level evolves from learning", () => {
  const learn = (id: string) => ({ op: "add" as const, kind: "knowledge" as const, subject_entity: id, content: `Learned what ${id} is`, source: "inferred" as const });
  const level = (content: string) => ({ op: "add" as const, kind: "knowledge" as const, subject_entity: "level:cricket", content, source: "stated" as const });

  it("a 'new' fan becomes 'casual' after learning 3 concepts, and it is labelled inferred", async () => {
    const { user, applyStatedOps, updateLevel, loadProfile, store } = await setup();
    await applyStatedOps(user, [level("New follower")], now);
    await applyStatedOps(user, [learn("topic:yorker"), learn("topic:dls")], now);
    expect(await updateLevel(user, now)).toEqual([]); // 2 concepts: not yet
    await applyStatedOps(user, [learn("topic:finisher")], now);
    const changes = await updateLevel(user, now);
    expect(changes).toHaveLength(1);
    expect((await loadProfile(user, now)).level).toBe("casual");
    const lvl = (await store.listMemories(user.id)).find((m) => m.subject_entity === "level:cricket")!;
    expect(lvl.source).toBe("inferred");
  });

  it("does nothing once nothing new has been learned", async () => {
    const { user, applyStatedOps, updateLevel } = await setup();
    await applyStatedOps(user, [level("Casual follower"), learn("topic:yorker")], now);
    expect(await updateLevel(user, now)).toEqual([]);
  });
});

describe("levels are tracked per sport", () => {
  const learn = (id: string) => ({ op: "add" as const, kind: "knowledge" as const, subject_entity: id, content: `Learned what ${id} is`, source: "inferred" as const });

  it("learning basketball concepts raises the basketball level only, and not cricket's", async () => {
    const { user, applyStatedOps, updateLevel, loadProfile, store } = await setup();
    await applyStatedOps(user, [{ op: "add", kind: "knowledge", subject_entity: "level:cricket", content: "Casual follower", source: "stated" }], now);
    await applyStatedOps(user, [learn("topic:pick-and-roll"), learn("topic:three-pointer"), learn("topic:alley-oop")], now);
    const changes = await updateLevel(user, now);
    expect(changes).toHaveLength(1);
    const p = await loadProfile(user, now);
    expect(p.levels.basketball).toBe("casual"); // new → casual after 3 concepts
    expect(p.level).toBe("casual"); // cricket untouched
    const mem = (await store.listMemories(user.id)).find((m) => m.subject_entity === "level:basketball")!;
    expect(mem).toMatchObject({ source: "inferred", content: "Casual basketball follower" });
  });

  it("learning cricket concepts does not move basketball", async () => {
    const { user, applyStatedOps, updateLevel, loadProfile } = await setup();
    await applyStatedOps(user, [learn("topic:yorker"), learn("topic:dls"), learn("topic:finisher")], now);
    await updateLevel(user, now);
    const p = await loadProfile(user, now);
    expect(p.levels.basketball).toBeUndefined();
  });
});
