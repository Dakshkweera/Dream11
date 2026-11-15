import { describe, expect, it } from "vitest";
import entities from "../../../data/entities.json";
import facts from "../../../data/facts.json";
import matches from "../../../data/matches.json";
import relations from "../../../data/relations.json";
import { numbersIn } from "../story/grounding";

const entityIds = new Set(entities.map((e) => e.id));

describe("dataset integrity", () => {
  it("has unique ids", () => {
    expect(new Set(entities.map((e) => e.id)).size).toBe(entities.length);
    expect(new Set(facts.map((f) => f.id)).size).toBe(facts.length);
  });

  it("every fact points at known entities and has a https source", () => {
    for (const f of facts) {
      expect(f.entities.length, f.id).toBeGreaterThan(0);
      for (const id of f.entities) expect(entityIds.has(id), `${f.id} -> ${id}`).toBe(true);
      expect(f.source_url, f.id).toMatch(/^https:\/\//);
    }
  });

  it("every fact's numbers appear in its text, and every number in its text is declared", () => {
    for (const f of facts) {
      const inText = new Set(numbersIn(f.text));
      for (const n of f.numbers) expect(inText.has(n), `${f.id} declares ${n}`).toBe(true);
      for (const n of inText) expect(f.numbers.includes(n), `${f.id} text has undeclared ${n}`).toBe(true);
    }
  });

  it("writes numbers as digits so the grounding check can compare them", () => {
    // "a six" and "a four" are cricket terms, so they're allowed.
    // "three-pointer", "three-point" and "and-one" are basketball terms, so they are allowed.
    const words = /\b(?:(?<!and-)one|two|three(?!-point)|five|seven|eight|nine|ten|eleven|twelve)\b/i;
    for (const f of facts) expect(f.text, f.id).not.toMatch(words);
  });

  it("relations only connect known entities", () => {
    for (const r of relations) {
      expect(entityIds.has(r.from), `from ${r.from}`).toBe(true);
      expect(entityIds.has(r.to), `to ${r.to}`).toBe(true);
    }
  });

  it("every entity has at least one fact", () => {
    for (const e of entities) expect(facts.some((f) => f.entities.includes(e.id)), e.id).toBe(true);
  });

  it("match squads and picks reference known entities", () => {
    for (const m of matches) {
      for (const id of [...m.teams, ...(m.venue ? [m.venue] : [])]) expect(entityIds.has(id), `${m.id} ${id}`).toBe(true);
      for (const squad of Object.values(m.squads))
        for (const p of squad) if ("entityId" in p && p.entityId) expect(entityIds.has(p.entityId as string), `${m.id} ${p.name}`).toBe(true);
    }
  });
});
