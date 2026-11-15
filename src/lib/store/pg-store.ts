/** Neon Postgres store — used whenever DATABASE_URL is set and STORE != "file". */
import { sql } from "../db";
import type { AppEvent, Discovery, Memory, Store, StoredMessage, User } from "./types";

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

function toMemory(r: Record<string, unknown>): Memory {
  return {
    ...(r as unknown as Memory),
    confidence: Number(r.confidence),
    evidence_count: Number(r.evidence_count),
    last_reinforced_at: iso(r.last_reinforced_at),
    created_at: iso(r.created_at),
  };
}

export const pgStore: Store = {
  async ensureUser(id) {
    await sql`INSERT INTO users (id) VALUES (${id}) ON CONFLICT (id) DO NOTHING`;
    const [r] = await sql`SELECT * FROM users WHERE id = ${id}`;
    return { ...(r as unknown as User), created_at: iso(r.created_at), clock_offset_days: Number(r.clock_offset_days) };
  },
  async updateUser(id, patch) {
    if (patch.display_name !== undefined) await sql`UPDATE users SET display_name = ${patch.display_name} WHERE id = ${id}`;
    if (patch.onboarded !== undefined) await sql`UPDATE users SET onboarded = ${patch.onboarded} WHERE id = ${id}`;
    if (patch.clock_offset_days !== undefined)
      await sql`UPDATE users SET clock_offset_days = ${patch.clock_offset_days} WHERE id = ${id}`;
  },
  async resetUser(id) {
    await sql`DELETE FROM memories WHERE user_id = ${id}`;
    await sql`DELETE FROM events WHERE user_id = ${id}`;
    await sql`DELETE FROM messages WHERE user_id = ${id}`;
    await sql`DELETE FROM discoveries WHERE user_id = ${id}`;
    await sql`DELETE FROM fantasy_picks WHERE user_id = ${id}`;
    await sql`UPDATE users SET onboarded = false, clock_offset_days = 0, display_name = NULL WHERE id = ${id}`;
  },

  async listMemories(userId) {
    return (await sql`SELECT * FROM memories WHERE user_id = ${userId} ORDER BY created_at`).map(toMemory);
  },
  async saveMemory(m) {
    await sql`
      INSERT INTO memories (id, user_id, kind, subject_entity, content, source, confidence, evidence_count,
                            last_reinforced_at, status, polarity, created_at)
      VALUES (${m.id}, ${m.user_id}, ${m.kind}, ${m.subject_entity}, ${m.content}, ${m.source}, ${m.confidence},
              ${m.evidence_count}, ${m.last_reinforced_at}, ${m.status}, ${m.polarity}, ${m.created_at})
      ON CONFLICT (id) DO UPDATE SET
        kind = EXCLUDED.kind, subject_entity = EXCLUDED.subject_entity, content = EXCLUDED.content,
        source = EXCLUDED.source, confidence = EXCLUDED.confidence, evidence_count = EXCLUDED.evidence_count,
        last_reinforced_at = EXCLUDED.last_reinforced_at, status = EXCLUDED.status, polarity = EXCLUDED.polarity`;
  },
  async deleteMemory(userId, id) {
    await sql`DELETE FROM memories WHERE user_id = ${userId} AND id = ${id}`;
  },

  async addEvent(e: AppEvent) {
    await sql`INSERT INTO events (user_id, type, entity_id, payload, created_at)
              VALUES (${e.user_id}, ${e.type}, ${e.entity_id}, ${JSON.stringify(e.payload ?? null)}, ${e.created_at})`;
  },

  async listPicks(userId) {
    return (await sql`SELECT pick_key FROM fantasy_picks WHERE user_id = ${userId} ORDER BY created_at`).map((r) => String(r.pick_key));
  },
  async setPick(userId, key, picked) {
    if (picked) {
      await sql`INSERT INTO fantasy_picks (user_id, pick_key) VALUES (${userId}, ${key}) ON CONFLICT DO NOTHING`;
    } else {
      await sql`DELETE FROM fantasy_picks WHERE user_id = ${userId} AND pick_key = ${key}`;
    }
  },

  async addMessage(m) {
    await sql`INSERT INTO messages (user_id, role, content, story, context, created_at)
              VALUES (${m.user_id}, ${m.role}, ${m.content}, ${JSON.stringify(m.story ?? null)},
                      ${JSON.stringify(m.context ?? null)}, ${m.created_at ?? new Date().toISOString()})`;
  },
  async recentMessages(userId, limit) {
    const rows = await sql`SELECT * FROM messages WHERE user_id = ${userId} ORDER BY created_at DESC, id DESC LIMIT ${limit}`;
    return rows
      .map((r) => ({ ...(r as unknown as StoredMessage), id: String(r.id), created_at: iso(r.created_at) }))
      .reverse();
  },

  async addDiscovery(d: Discovery) {
    await sql`INSERT INTO discoveries (user_id, entity_id, angle, surface, session_id, outcome, created_at)
              VALUES (${d.user_id}, ${d.entity_id}, ${d.angle}, ${d.surface}, ${d.session_id}, ${d.outcome}, ${d.created_at})`;
  },
  async listDiscoveries(userId, limit) {
    const rows = await sql`SELECT * FROM discoveries WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}`;
    return rows.map((r) => ({ ...(r as unknown as Discovery), created_at: iso(r.created_at) }));
  },
  async setDiscoveryOutcome(userId, entityId, outcome) {
    await sql`UPDATE discoveries SET outcome = ${outcome}
              WHERE id = (SELECT id FROM discoveries WHERE user_id = ${userId} AND entity_id = ${entityId}
                          ORDER BY created_at DESC LIMIT 1)`;
  },
};
