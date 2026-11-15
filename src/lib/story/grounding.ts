/**
 * Grounding check: a generated story may only cite facts that were retrieved,
 * and every number it states must appear in one of the facts it cites.
 */
import type { Fact } from "../facts/schema";

export type GroundingResult = { ok: true } | { ok: false; problems: string[] };

/** Numbers as written in prose: "973", "2,016", "4.5". Ordinals like "18th" count as 18. */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:st|nd|rd|th)?(?![\w.]*\d)/g)].map((m) =>
    Number(m[1].replace(/,/g, "")),
  );
}

export function checkGrounding(body: string, citedIds: string[], available: Fact[]): GroundingResult {
  const problems: string[] = [];
  const byId = new Map(available.map((f) => [f.id, f]));

  const unknown = citedIds.filter((id) => !byId.has(id));
  if (unknown.length) problems.push(`cited unknown fact ids: ${unknown.join(", ")}`);
  if (!citedIds.length) problems.push("no facts cited");

  const cited = citedIds.map((id) => byId.get(id)).filter((f): f is Fact => !!f);
  const allowed = new Set<number>();
  for (const f of cited) {
    for (const n of f.numbers) allowed.add(n);
    for (const n of numbersIn(f.text)) allowed.add(n);
  }
  const stray = [...new Set(numbersIn(body))].filter((n) => !allowed.has(n));
  if (stray.length) problems.push(`numbers not supported by cited facts: ${stray.join(", ")}`);

  return problems.length ? { ok: false, problems } : { ok: true };
}

/**
 * A draft often uses a real number from a fact it forgot to cite (say, the 2020 score in a story about 2024).
 * If every number it uses exists in some available fact, add those facts to its citations so it passes
 * for the right reason. A number that exists in no fact at all is left alone, and will fail the check.
 */
export function repairCitations(body: string, citedIds: string[], available: Fact[]): string[] {
  const byId = new Map(available.map((f) => [f.id, f]));
  const cited = citedIds.filter((id) => byId.has(id));
  const known = (f: Fact) => new Set([...f.numbers, ...numbersIn(f.text)]);
  const allowed = new Set<number>();
  for (const id of cited) known(byId.get(id)!).forEach((n) => allowed.add(n));

  const added: string[] = [];
  for (const n of new Set(numbersIn(body))) {
    if (allowed.has(n)) continue;
    const source = available.find((f) => known(f).has(n));
    if (!source) return citedIds; // invented: leave it to fail the check
    added.push(source.id);
    known(source).forEach((x) => allowed.add(x));
  }
  return [...new Set([...cited, ...added])];
}
