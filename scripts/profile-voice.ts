/**
 * Times the first word of a spoken-conversation reply over several turns, against your real database:
 * the same prompt the app builds (profile, facts, history, voice style), voice settings and hedging.
 *   npx tsx scripts/profile-voice.ts           (spoken replies)
 *   npx tsx scripts/profile-voice.ts --typed   (typed chat replies, same questions)
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const QUESTIONS = [
  "Why does everyone love MS Dhoni so much?",
  "Okay, and who was better in the 2025 final?",
  "What happened in the Paris Olympic final?",
  "Who scored the most points for France?",
];

async function main() {
  const { getStore } = await import("../src/lib/store");
  const { prepareChat, streamReply, withSystemNote } = await import("../src/lib/friend/service");
  const store = getStore();
  const id = `voice_${Math.random().toString(36).slice(2, 8)}`;
  const user = await store.ensureUser(id);

  for (const q of QUESTIONS) {
    const t0 = performance.now();
    const prepared = await prepareChat(user, q, undefined, new Date());
    const prepMs = Math.round(performance.now() - t0);
    const typed = process.argv.includes("--typed");
    const messages = typed ? prepared.messages : withSystemNote(prepared.messages, "voice");
    const chars = messages.reduce((n, m) => n + (typeof m.content === "string" ? m.content.length : 0), 0);
    const t = performance.now();
    let first = 0;
    let reply = "";
    for await (const d of streamReply(messages, { voice: !typed })) {
      first ||= Math.round(performance.now() - t);
      reply += d;
    }
    const total = Math.round(performance.now() - t);
    console.log(`prepare ${prepMs}ms · first word ${first}ms · whole reply ${total}ms · ${chars} chars · outside=${prepared.outside}\n  Q: ${q}\n  A: ${reply.slice(0, 140)}\n`);
    await store.addMessage({ user_id: id, role: "user", content: q, story: null, context: null });
    await store.addMessage({ user_id: id, role: "assistant", content: reply, story: null, context: null });
  }
  await store.resetUser(id);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
