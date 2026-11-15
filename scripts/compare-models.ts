/**
 * Side-by-side chat quality and speed for two models on realistic fan questions, using the app's real prompts.
 *   npm run compare-models -- anthropic/claude-sonnet-5.5 anthropic/claude-haiku-5.5
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const QUESTIONS = [
  "Why does everyone love Dhoni?",
  "Who is Hardik Pandya?", // not in the dataset: should admit it, not invent
  "I'm not really into CSK, I just like Dhoni.",
  "Explain what happened in the 2019 final like I'm new to cricket.",
];

async function main() {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) {
    console.error("Usage: npm run compare-models -- <modelA> <modelB>");
    process.exit(1);
  }
  const { prepareChat } = await import("../src/lib/friend/service");
  const { applyStatedOps } = await import("../src/lib/memory/service");
  const { chat } = await import("../src/lib/ai/openrouter");
  const { getStore } = await import("../src/lib/store");
  const store = getStore();
  const user = await store.ensureUser(`cmp_${Math.random().toString(36).slice(2, 7)}`);
  await applyStatedOps(
    user,
    [
      { op: "add", kind: "stated_preference", subject_entity: "player:virat-kohli", content: "Follows Virat Kohli", source: "stated" },
      { op: "add", kind: "knowledge", subject_entity: "level:cricket", content: "New follower", source: "stated" },
    ],
    new Date(),
  );

  for (const q of QUESTIONS) {
    const { messages } = await prepareChat(user, q, { surface: "home", entityIds: [] }, new Date());
    console.log(`\n=== ${q}`);
    for (const model of [a, b]) {
      const t = performance.now();
      const reply = await chat(messages, { model, maxTokens: 400, fallback: false });
      console.log(`\n[${model.split("/")[1]}  ${((performance.now() - t) / 1000).toFixed(1)}s total, ${reply.split(/\s+/).length} words]\n${reply}`);
    }
  }
  await store.resetUser(user.id);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
