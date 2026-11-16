/**
 * Tries the story model on a few topics (curated facts only, no web research, so it costs very little):
 * did each story pass the fact check, how long did it take, and what does it read like?
 *   MODEL_STORY=anthropic/claude-haiku-5.5 npx tsx scripts/story-models.ts
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const TARGETS = ["match:paris-2024-basketball-final", "player:ms-dhoni", "match:ipl-2025-final"];
const PROFILE = "Knowledge level: casual\nTold me: Follows Virat Kohli\nNoticed interest in: MS Dhoni";

async function main() {
  const { MODELS } = await import("../src/lib/ai/models");
  const { generateStory } = await import("../src/lib/story/generate");
  let grounded = 0;
  console.log(`================ ${MODELS.story}`);
  for (const id of TARGETS) {
    const t = Date.now();
    const s = await generateStory({ entityId: id, level: "casual", profileText: PROFILE, extraFacts: [] });
    if (s.grounded) grounded++;
    console.log(`\n--- ${id} · ${s.grounded ? "passed fact check" : "FELL BACK to plain facts"} · ${Date.now() - t}ms\n${s.title}\n${s.body}`);
  }
  console.log(`\n${MODELS.story}: ${grounded}/${TARGETS.length} passed the fact check`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
