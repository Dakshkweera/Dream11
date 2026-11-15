/**
 * The behaviour every Store backend must have. Run against the file store in unit tests and
 * against real Postgres with `npm run db:check`, so both stay interchangeable.
 */
import type { Memory, Store } from "./types";

type Check = { name: string; run: (s: Store, uid: string) => Promise<void> };

const mem = (uid: string, over: Partial<Memory> = {}): Memory => ({
  id: `m_${Math.random().toString(36).slice(2)}`,
  user_id: uid,
  kind: "stated_preference",
  subject_entity: "player:virat-kohli",
  content: "Follows Virat Kohli",
  source: "stated",
  confidence: 0.9,
  evidence_count: 1,
  last_reinforced_at: "2026-11-01T10:00:00.000Z",
  status: "active",
  polarity: "positive",
  created_at: "2026-11-01T10:00:00.000Z",
  ...over,
});

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`contract: ${msg}`);
}

export const checks: Check[] = [
  {
    name: "creates a user once and keeps its settings",
    async run(s, uid) {
      const a = await s.ensureUser(uid);
      assert(a.id === uid && a.onboarded === false && a.clock_offset_days === 0, "new user defaults");
      await s.updateUser(uid, { onboarded: true, display_name: "Riya", clock_offset_days: 7 });
      const b = await s.ensureUser(uid);
      assert(b.onboarded === true && b.display_name === "Riya" && b.clock_offset_days === 7, "updates persist");
    },
  },
  {
    name: "saves, updates and deletes memories",
    async run(s, uid) {
      await s.ensureUser(uid);
      const m = mem(uid);
      await s.saveMemory(m);
      let all = await s.listMemories(uid);
      assert(all.length === 1 && all[0].content === "Follows Virat Kohli", "saved");
      assert(typeof all[0].confidence === "number" && all[0].confidence === 0.9, "confidence is a number");
      assert(typeof all[0].last_reinforced_at === "string", "timestamps are strings");
      await s.saveMemory({ ...m, confidence: 0.4, evidence_count: 3, status: "corrected", polarity: "negative" });
      all = await s.listMemories(uid);
      assert(all.length === 1 && all[0].evidence_count === 3 && all[0].status === "corrected" && all[0].polarity === "negative", "upsert");
      await s.deleteMemory(uid, m.id);
      assert((await s.listMemories(uid)).length === 0, "deleted");
    },
  },
  {
    name: "keeps users separate",
    async run(s, uid) {
      await s.ensureUser(uid);
      await s.ensureUser(`${uid}_other`);
      await s.saveMemory(mem(uid));
      assert((await s.listMemories(`${uid}_other`)).length === 0, "other user sees nothing");
      await s.resetUser(`${uid}_other`);
      assert((await s.listMemories(uid)).length === 1, "resetting one user leaves the other");
    },
  },
  {
    name: "stores fantasy picks without duplicates",
    async run(s, uid) {
      await s.ensureUser(uid);
      await s.setPick(uid, "player:ms-dhoni", true);
      await s.setPick(uid, "player:ms-dhoni", true);
      await s.setPick(uid, "name:Phil Salt", true);
      let picks = await s.listPicks(uid);
      assert(picks.length === 2 && picks.includes("player:ms-dhoni") && picks.includes("name:Phil Salt"), "two picks");
      await s.setPick(uid, "player:ms-dhoni", false);
      picks = await s.listPicks(uid);
      assert(picks.length === 1 && picks[0] === "name:Phil Salt", "unpicked");
    },
  },
  {
    name: "stores messages, including story objects, oldest first",
    async run(s, uid) {
      await s.ensureUser(uid);
      await s.addMessage({ user_id: uid, role: "user", content: "hi", story: null, context: { surface: "home" } });
      await s.addMessage({
        user_id: uid,
        role: "assistant",
        content: "A story",
        story: { title: "T", body: "B", threads: [{ label: "x", entityId: "player:ms-dhoni" }] },
        context: null,
      });
      const msgs = await s.recentMessages(uid, 10);
      assert(msgs.length === 2 && msgs[0].role === "user" && msgs[1].role === "assistant", "order");
      const story = msgs[1].story as { title?: string; threads?: { entityId: string }[] } | null;
      assert(story?.title === "T" && story.threads?.[0].entityId === "player:ms-dhoni", "story round-trips as an object");
      assert((await s.recentMessages(uid, 1)).length === 1 && (await s.recentMessages(uid, 1))[0].role === "assistant", "limit keeps the newest");
    },
  },
  {
    name: "tracks discoveries and their outcome",
    async run(s, uid) {
      await s.ensureUser(uid);
      const base = { user_id: uid, angle: "a", surface: "home" as const, session_id: "s1", outcome: "shown" as const };
      await s.addDiscovery({ ...base, entity_id: "player:ms-dhoni", created_at: "2026-11-01T10:00:00.000Z" });
      await s.addDiscovery({ ...base, entity_id: "team:rcb", created_at: "2026-11-02T10:00:00.000Z" });
      let list = await s.listDiscoveries(uid, 10);
      assert(list.length === 2 && list[0].entity_id === "team:rcb", "newest first");
      await s.setDiscoveryOutcome(uid, "player:ms-dhoni", "opened");
      list = await s.listDiscoveries(uid, 10);
      assert(list.find((d) => d.entity_id === "player:ms-dhoni")?.outcome === "opened", "outcome updated");
    },
  },
  {
    name: "logs events and resets everything for a user",
    async run(s, uid) {
      await s.ensureUser(uid);
      await s.addEvent({ user_id: uid, type: "viewed_player", entity_id: "player:ms-dhoni", created_at: "2026-11-01T10:00:00.000Z" });
      await s.saveMemory(mem(uid));
      await s.setPick(uid, "player:ms-dhoni", true);
      await s.addMessage({ user_id: uid, role: "user", content: "hi", story: null, context: null });
      await s.updateUser(uid, { onboarded: true, clock_offset_days: 3 });
      await s.resetUser(uid);
      assert((await s.listMemories(uid)).length === 0, "memories cleared");
      assert((await s.listPicks(uid)).length === 0, "picks cleared");
      assert((await s.recentMessages(uid, 10)).length === 0, "messages cleared");
      const u = await s.ensureUser(uid);
      assert(u.onboarded === false && u.clock_offset_days === 0, "user flags reset");
    },
  },
];

/** Runs every check with a fresh user id; returns failures instead of throwing so callers can report all. */
export async function runContract(s: Store, prefix = "contract"): Promise<{ name: string; error?: string }[]> {
  const results: { name: string; error?: string }[] = [];
  for (const c of checks) {
    const uid = `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      await c.run(s, uid);
      results.push({ name: c.name });
    } catch (e) {
      results.push({ name: c.name, error: (e as Error).message });
    } finally {
      await s.resetUser(uid).catch(() => {});
      await s.resetUser(`${uid}_other`).catch(() => {});
    }
  }
  return results;
}
