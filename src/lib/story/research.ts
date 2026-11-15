/**
 * Research step: before a story is written, the app searches the web for specific, interesting facts about the
 * topic and adds them to the hand-checked ones. The storyteller then writes from both, and the same fact check
 * (numbers must come from cited facts) applies to the whole pool. Web facts are labelled and linked to their page.
 *
 * Results don't depend on the fan, so they're cached for everyone (6 hours): the first fan pays, the rest get it free.
 */
import { z } from "zod";
import { MODELS } from "../ai/models";
import { jsonWithWeb, type WebSource } from "../ai/openrouter";
import { getEntity } from "../facts/retrieve";
import type { Fact } from "../facts/schema";
import { createCache } from "./cache";
import { numbersIn } from "./grounding";

export type ResearchFact = Fact & { origin: "web"; domain: string };

const Out = z.object({
  facts: z.array(
    z.object({
      text: z.string(),
      source: z.string().describe("domain of the page this fact came from, e.g. espncricinfo.com"),
    }),
  ),
});

const SYSTEM = `You are a sports researcher. Using ONLY the web search results, list 6 to 8 specific, verifiable facts about the topic that would make a gripping story for a casual fan of the sport: results, exact numbers, turning points, records, history, human moments (what players did or said). One sentence each, numbers as digits. Name the site each fact came from. No opinions, no speculation, nothing you cannot see in the results.`;

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};
const normDomain = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

/** Turn the model's bullets into Fact objects, tying each to a page the search actually returned. */
export function toResearchFacts(
  raw: { text: string; source: string }[],
  sources: WebSource[],
  entityId: string,
  today: string,
  max = 8,
): ResearchFact[] {
  if (!sources.length) return []; // no pages came back, so nothing here can be trusted
  const out: ResearchFact[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const text = r.text.trim().replace(/\s+/g, " ");
    if (text.length < 20 || text.length > 320 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    const d = normDomain(r.source);
    const match = sources.find((s) => {
      const h = host(s.url);
      return d && h && (h === d || h.endsWith(`.${d}`) || d.endsWith(`.${h}`));
    });
    const page = match ?? sources[0];
    out.push({
      id: `w-${out.length + 1}`,
      entities: [entityId],
      type: "profile",
      text,
      numbers: [...new Set(numbersIn(text))],
      source_url: page.url,
      as_of: today,
      verified: false,
      origin: "web",
      domain: host(page.url) || d,
    });
    if (out.length >= max) break;
  }
  return out;
}

async function fetchResearch(entityId: string): Promise<ResearchFact[]> {
  const e = getEntity(entityId);
  if (!e) return [];
  const today = new Date().toISOString().slice(0, 10);
  const topic = `${e.name} — ${e.summary} (Today is ${today}; prefer the latest information.)`;
  const { data, sources } = await jsonWithWeb(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Topic: ${topic}` },
    ],
    Out,
    { model: MODELS.extract, schemaName: "research", maxResults: 6 },
  );
  return toResearchFacts(data.facts, sources, entityId, today);
}

const cache = createCache<ResearchFact[]>({ ttlMs: 6 * 3600_000, max: 200 });

/**
 * Research a topic, or return [] if it is switched off (STORY_RESEARCH=0), the caller is over its spending limit,
 * or the search failed. A cache hit is free and never counts against the limit.
 */
export async function research(entityId: string, opts: { allowNew: () => boolean }): Promise<ResearchFact[]> {
  if (process.env.STORY_RESEARCH === "0") return [];
  const key = `research|${entityId}`;
  if (!cache.has(key) && !opts.allowNew()) return [];
  try {
    const { value } = await cache.getOrCreate(key, () => fetchResearch(entityId), (facts) => facts.length >= 3);
    return value;
  } catch (e) {
    console.warn("[research] failed:", (e as Error).message);
    return [];
  }
}
