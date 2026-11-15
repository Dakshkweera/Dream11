/**
 * Quality gate for the story generator against the live model:
 * generates a story for several entities and reports whether each passed the fact check
 * on the first try (grounded) or fell back to plain facts.
 *   npm run story-check
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const TARGETS: { id: string; angle?: string }[] = [
  { id: "match:paris-2024-basketball-final" },
  { id: "player:stephen-curry" },
];

async function main() {
  const { generateStory } = await import("../src/lib/story/generate");
  let grounded = 0;
  for (const t of TARGETS) {
    const t0 = Date.now();
    const { research } = await import("../src/lib/story/research");
    const extraFacts = await research(t.id, { allowNew: () => true });
    const s = await generateStory({
      extraFacts,
      entityId: t.id,
      angle: t.angle,
      level: "casual",
      profileText: "Knowledge level: casual\nTold me: Follows Virat Kohli\nNoticed interest in: MS Dhoni",
    });
    if (s.grounded) grounded++;
    const words = s.body.split(/\s+/).length;
    console.log(`\n${s.grounded ? "✓ grounded" : "✗ FALLBACK"}  ${t.id}  (${((Date.now() - t0) / 1000).toFixed(1)}s, ${words} words, ${s.sources.length} sources, ${s.threads.length} threads)`);
    console.log(`  ${s.title}`);
    console.log(`  ${s.body.replace(/\n/g, " ")}`);
    console.log(`  sources: ${s.sources.filter((x) => x.web).length} from the web, ${s.sources.filter((x) => !x.web).length} hand-checked`);
    console.log(`  threads: ${s.threads.map((x) => x.label).join(" | ")}`);
  }
  console.log(`\n${grounded}/${TARGETS.length} grounded on the first pass`);
  process.exit(grounded === TARGETS.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
