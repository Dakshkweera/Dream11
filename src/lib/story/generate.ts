/**
 * Dynamic, grounded story generation. Code picks the entity and retrieves facts (the hand-checked ones plus
 * facts the research step just found on the web); the storyteller finds the angle and writes; the grounding
 * check enforces honesty across the whole pool.
 */
import { z } from "zod";
import { json } from "../ai/openrouter";
import { MODELS } from "../ai/models";
import { bundleToPrompt, findEntity, neighbours, retrieveBundle, type FactBundle } from "../facts/retrieve";
import type { Fact } from "../facts/schema";
import { STORYTELLER, levelGuide } from "../friend/persona";
import type { KnowledgeLevel } from "../memory/service";
import { stripFactIds } from "../friend/sanitize";
import { checkGrounding, repairCitations } from "./grounding";
import type { ResearchFact } from "./research";

export type StoryThread = { label: string; entityId: string };
/** `web` marks a fact found by search (shown as "from the web"); `verified` is only ever true for hand-checked facts. */
export type StorySource = { id: string; text: string; url: string; verified: boolean; web?: boolean };

export type Story = {
  entityId: string;
  title: string;
  body: string;
  threads: StoryThread[];
  sources: StorySource[];
  grounded: boolean; // false → safe fallback was used
};

const StoryOut = z.object({
  title: z.string().describe("Punchy title, max 8 words"),
  body: z.string().describe("120–180 words, told by an excited storyteller, second person where natural"),
  cited_fact_ids: z.array(z.string()).describe("Ids of every fact (f-… or w-…) the body relies on"),
  threads: z
    .array(z.object({ label: z.string().describe("Curiosity hook, max 7 words, e.g. 'Why CSK fans call him Sir'"), entity: z.string() }))
    .describe("2–3 doors outward: each names one CONNECTED entity (exact name)"),
});

export type StoryRequest = {
  entityId: string;
  angle?: string; // from the discovery selector or a picked thread
  profileText: string;
  level: KnowledgeLevel;
  context?: string; // page / match context
  alsoEntities?: string[];
  /** Facts the research step found on the web just now. */
  extraFacts?: ResearchFact[];
};

const SYSTEM = `${STORYTELLER}

THE RULES YOU NEVER BREAK:
- Tell this story using only the FACTS and WEB FACTS you are given. Cite every fact you use by id (f-… or w-…) in cited_fact_ids. If a WEB FACT conflicts with a FACT, trust the FACT.
- Do not write any number, year or statistic that is not in a fact you cite.
- Every claim about who did what, who captained, who won or what a moment meant must be stated in a fact you cite. No invented interpretation or causes, and do not call a team someone's team unless a fact says they led it.
- Explain sport-specific terms using only what the facts or this prompt define.
- Never write fact ids such as [f-0012] inside the story text; cite them only in cited_fact_ids.
- Write every number, year and statistic as digits (18, 75, 2025), never as words, so it can be checked.
- Keep the events in the order the facts give them. Never stage a fake twist, a "wait, that's..." self-correction, or a question you answer by contradicting yourself. If you are unsure how two facts fit together, leave one out.
- Do not add flourishes about what something meant, who it was "home turf" for, or how the crowd or the fans felt, unless a fact says so. Finish on a fact, not a flourish.
- 120–180 words. No headings, no lists.
- Find the most gripping connection in the facts: a twist, a wait that finally ended, a rivalry, a link to someone the fan already cares about.
- Threads: 2–3 doors to CONNECTED entities that lead the fan outward from what they already like.`;

function webFactsToPrompt(facts: ResearchFact[]): string {
  if (!facts.length) return "";
  return [
    "WEB FACTS (found a moment ago by web search, not hand-checked; cite by id like the FACTS):",
    ...facts.map((f) => `[${f.id}] ${f.text} (from ${f.domain})`),
  ].join("\n");
}

export async function generateStory(req: StoryRequest): Promise<Story> {
  const bundle = retrieveBundle(req.entityId, { limit: 22, also: req.alsoEntities });
  if (!bundle) throw new Error(`Unknown entity ${req.entityId}`);
  const extra = req.extraFacts ?? [];
  const available: Fact[] = [...bundle.facts, ...extra];

  const user = [
    `FAN PROFILE:\n${req.profileText}`,
    `EXPLAIN AT THIS LEVEL (${bundle.focus.sport}): ${levelGuide(req.level, bundle.focus.sport)}`,
    req.context ? `CURRENT CONTEXT: ${req.context}` : "",
    req.angle ? `SUGGESTED ANGLE: ${req.angle}` : "",
    bundleToPrompt(bundle),
    webFactsToPrompt(extra),
  ]
    .filter(Boolean)
    .join("\n\n");

  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await json(
        [
          { role: "system", content: SYSTEM },
          { role: "user", content: feedback ? `${user}\n\nYOUR LAST DRAFT FAILED THE FACT CHECK: ${feedback}. Fix it.` : user },
        ],
        StoryOut,
        { model: MODELS.story, schemaName: "story", maxTokens: 3000, temperature: 0.9 },
      );
      // A real number from a fact the draft forgot to cite is fixed by citing it; an invented number still fails.
      const cited = repairCitations(out.body, out.cited_fact_ids, available);
      const check = checkGrounding(out.body, cited, available);
      if (check.ok) return finalise(bundle, out.title, out.body, cited, out.threads, available, true);
      feedback = check.problems.join("; ");
      console.warn(`[story] grounding failed (attempt ${attempt + 1}): ${feedback}`);
    } catch (e) {
      console.warn("[story] generation failed:", (e as Error).message);
      feedback = feedback || "invalid output";
    }
  }
  return fallbackStory(bundle);
}

function finalise(
  bundle: FactBundle,
  title: string,
  body: string,
  citedIds: string[],
  rawThreads: { label: string; entity: string }[],
  available: Fact[],
  grounded: boolean,
): Story {
  const threads: StoryThread[] = [];
  const seen = new Set<string>([bundle.focus.id]);
  for (const t of rawThreads) {
    const e = findEntity(t.entity);
    if (e && !seen.has(e.id)) {
      threads.push({ label: t.label, entityId: e.id });
      seen.add(e.id);
    }
  }
  // Always offer at least two doors outward.
  for (const n of neighbours(bundle.focus.id)) {
    if (threads.length >= 2) break;
    if (seen.has(n.entity.id) || n.entity.type === "competition") continue;
    const label = n.entity.type === "player" ? `Who is ${n.entity.name}?` : `Tell me about ${n.entity.name}`;
    threads.push({ label, entityId: n.entity.id });
    seen.add(n.entity.id);
  }
  const byId = new Map(available.map((f) => [f.id, f]));
  const sources: StorySource[] = [...new Set(citedIds)]
    .map((id) => byId.get(id))
    .filter((f): f is Fact => !!f)
    .map((f) => ({ id: f.id, text: f.text, url: f.source_url, verified: f.verified, ...("origin" in f ? { web: true } : {}) }));
  return { entityId: bundle.focus.id, title, body: stripFactIds(body), threads: threads.slice(0, 3), sources, grounded };
}

/** Grounded by construction: the facts themselves, lightly joined. */
function fallbackStory(bundle: FactBundle): Story {
  const top = bundle.facts.slice(0, 3);
  const body = top.length
    ? `Here's what I can tell you for sure about ${bundle.focus.name}. ${top.map((f) => f.text).join(" ")}`
    : `${bundle.focus.summary} I don't have many verified facts on ${bundle.focus.name} yet, so I won't guess.`;
  return finalise(bundle, bundle.focus.name, body, top.map((f) => f.id), [], bundle.facts, false);
}
