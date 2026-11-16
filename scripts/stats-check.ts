/**
 * Asks Buzzer statistics questions through the real chat pipeline (same prompt, same model) and prints the
 * answers next to the numbers it was given, to check it answers from the data and admits what's missing.
 *   npx tsx scripts/stats-check.ts
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type Q = { q: string; matchId?: string; playerIds?: string[] };
const QUESTIONS: Q[] = [
  { q: "Why is Kohli's strike rate low in this final?", matchId: "rcb-vs-pbks", playerIds: ["player:virat-kohli"] },
  { q: "Compare Virat Kohli and Shashank Singh in this final.", matchId: "rcb-vs-pbks", playerIds: ["player:virat-kohli", "player:shashank-singh"] },
  { q: "How does Kohli's performance here compare with his previous matches?", matchId: "rcb-vs-gt", playerIds: ["player:virat-kohli"] },
  { q: "Explain Stephen Curry's performance in the Olympic final.", matchId: "usa-vs-fra", playerIds: ["player:stephen-curry"] },
  { q: "What does Wembanyama's plus/minus of -8 mean?", matchId: "usa-vs-fra", playerIds: ["player:victor-wembanyama"] },
  { q: "What was Kohli's strike rate in the 2016 IPL final?", matchId: "rcb-vs-pbks", playerIds: ["player:virat-kohli"] },
];

async function main() {
  const { getStore } = await import("../src/lib/store");
  const { prepareChat, streamReply } = await import("../src/lib/friend/service");
  const store = getStore();
  const user = await store.ensureUser(`statscheck_${Math.random().toString(36).slice(2, 8)}`);
  for (const { q, matchId, playerIds } of QUESTIONS) {
    const ctx = { surface: "player" as const, label: "statistics", entityIds: [], stats: { matchId, playerIds: playerIds ?? [] } };
    const prepared = await prepareChat(user, q, ctx, new Date());
    const system = String(prepared.messages[0].content);
    const hasStats = system.includes("STATS:");
    let reply = "";
    for await (const d of streamReply(prepared.messages)) reply += d;
    console.log(`\nQ: ${q}\n   [stats in prompt: ${hasStats ? "yes" : "NO"} · web lookup: ${prepared.outside ? "yes" : "no"}]\nA: ${reply.trim()}`);
  }
  await store.resetUser(user.id);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
