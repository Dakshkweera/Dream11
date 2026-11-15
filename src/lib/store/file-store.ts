/**
 * Local JSON-file store for development when Postgres isn't reachable.
 * Not for production: Vercel's filesystem does not persist between requests.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AppEvent, Discovery, Memory, Store, StoredMessage, User } from "./types";

type Data = {
  users: User[];
  memories: Memory[];
  events: AppEvent[];
  messages: StoredMessage[];
  discoveries: Discovery[];
  picks?: { user_id: string; key: string }[];
};

const DIR = process.env.STORE_DIR ?? join(process.cwd(), ".data");
const FILE = join(DIR, "store.json");
let cache: Data | null = null;
let writing: Promise<void> = Promise.resolve();

async function load(): Promise<Data> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(FILE, "utf8")) as Data;
  } catch {
    cache = { users: [], memories: [], events: [], messages: [], discoveries: [], picks: [] };
  }
  return cache;
}

function persist(): Promise<void> {
  // Serialise writes; write to a temp file then rename so a crash never corrupts the store.
  writing = writing.then(async () => {
    await mkdir(DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(cache, null, 1));
    await rename(tmp, FILE);
  });
  return writing;
}

const now = () => new Date().toISOString();
let seq = 0;
const id = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export const fileStore: Store = {
  async ensureUser(userId) {
    const d = await load();
    let u = d.users.find((x) => x.id === userId);
    if (!u) {
      u = { id: userId, display_name: null, onboarded: false, clock_offset_days: 0, created_at: now() };
      d.users.push(u);
      await persist();
    }
    return u;
  },
  async updateUser(userId, patch) {
    const d = await load();
    const u = d.users.find((x) => x.id === userId);
    if (u) Object.assign(u, patch);
    await persist();
  },
  async resetUser(userId) {
    const d = await load();
    d.memories = d.memories.filter((m) => m.user_id !== userId);
    d.events = d.events.filter((m) => m.user_id !== userId);
    d.messages = d.messages.filter((m) => m.user_id !== userId);
    d.discoveries = d.discoveries.filter((m) => m.user_id !== userId);
    d.picks = (d.picks ?? []).filter((m) => m.user_id !== userId);
    const u = d.users.find((x) => x.id === userId);
    if (u) Object.assign(u, { onboarded: false, clock_offset_days: 0, display_name: null });
    await persist();
  },

  async listMemories(userId) {
    return (await load()).memories.filter((m) => m.user_id === userId).map((m) => ({ ...m }));
  },
  async saveMemory(m) {
    const d = await load();
    const i = d.memories.findIndex((x) => x.id === m.id);
    if (i >= 0) d.memories[i] = { ...m };
    else d.memories.push({ ...m });
    await persist();
  },
  async deleteMemory(userId, memId) {
    const d = await load();
    d.memories = d.memories.filter((m) => !(m.user_id === userId && m.id === memId));
    await persist();
  },

  async addEvent(e) {
    (await load()).events.push(e);
    await persist();
  },

  async listPicks(userId) {
    return ((await load()).picks ?? []).filter((p) => p.user_id === userId).map((p) => p.key);
  },
  async setPick(userId, key, picked) {
    const d = await load();
    d.picks ??= [];
    d.picks = d.picks.filter((p) => !(p.user_id === userId && p.key === key));
    if (picked) d.picks.push({ user_id: userId, key });
    await persist();
  },

  async addMessage(m) {
    (await load()).messages.push({ ...m, id: id(), created_at: m.created_at ?? now() });
    await persist();
  },
  async recentMessages(userId, limit) {
    return (await load()).messages.filter((m) => m.user_id === userId).slice(-limit);
  },

  async addDiscovery(x) {
    (await load()).discoveries.push(x);
    await persist();
  },
  async listDiscoveries(userId, limit) {
    return (await load()).discoveries.filter((x) => x.user_id === userId).slice(-limit).reverse();
  },
  async setDiscoveryOutcome(userId, entityId, outcome) {
    const d = await load();
    const last = [...d.discoveries].reverse().find((x) => x.user_id === userId && x.entity_id === entityId);
    if (last) last.outcome = outcome;
    await persist();
  },
};
