/**
 * Times each step a chat turn does before the first word can appear, against your real database.
 *   npm run profile-chat
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = performance.now();
  const out = await fn();
  console.log(`${String(Math.round(performance.now() - t)).padStart(6)} ms  ${label}`);
  return out;
}

async function main() {
  const { getStore } = await import("../src/lib/store");
  const { loadProfile } = await import("../src/lib/memory/service");
  const { prepareChat, streamReply } = await import("../src/lib/friend/service");
  const store = getStore();
  const id = `profile_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`store: ${process.env.STORE === "file" || !process.env.DATABASE_URL ? "file" : "postgres"}\n`);

  await time("warm-up query (cold start / first connection)", () => store.ensureUser(id));
  const user = await time("ensureUser (repeat)", () => store.ensureUser(id));
  await time("listMemories", () => store.listMemories(id));
  await time("listPicks", () => store.listPicks(id));
  await time("recentMessages", () => store.recentMessages(id, 12));
  await time("loadProfile (memories + picks)", () => loadProfile(user, new Date()));
  const { messages } = await time("prepareChat (everything before the model)", () => prepareChat(user, "What's a yorker?", undefined, new Date()));
  const promptChars = messages.reduce((n, m) => n + (typeof m.content === "string" ? m.content.length : 0), 0);
  console.log(`        prompt size: ${promptChars} chars`);

  const t = performance.now();
  let first = 0;
  for await (const _ of streamReply(messages)) {
    void _;
    first ||= Math.round(performance.now() - t);
    break;
  }
  console.log(`${String(first).padStart(6)} ms  first word from the model`);
  await store.resetUser(id);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
