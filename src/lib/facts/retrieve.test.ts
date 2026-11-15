import { describe, expect, it } from "vitest";
import factsJson from "../../../data/facts.json";
import { numbersIn } from "../story/grounding";
import { entitiesMentioned, findEntity, getFact, retrieveBundle } from "./retrieve";

describe("fact retrieval", () => {
  it("resolves names and aliases", () => {
    expect(findEntity("Kohli")?.id).toBe("player:virat-kohli");
    expect(findEntity("MSD")?.id).toBe("player:ms-dhoni");
    expect(findEntity("csk")?.id).toBe("team:csk");
    expect(findEntity("Sachin")).toBeUndefined();
  });

  it("finds entities mentioned in commentary text", () => {
    const ids = entitiesMentioned("Dhoni walks out, Jadeja at the other end, CSK need 12").map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(["player:ms-dhoni", "player:ravindra-jadeja", "team:csk"]));
  });

  it("puts facts about the focus entity first and includes neighbours", () => {
    const b = retrieveBundle("player:ms-dhoni")!;
    expect(b.focus.name).toBe("MS Dhoni");
    expect(b.neighbours.map((n) => n.entity.id)).toContain("team:csk");
    expect(b.facts[0].entities).toContain("player:ms-dhoni");
    expect(b.facts.length).toBeGreaterThan(2);
  });

  it("every fact has a source and its numbers appear in its text", () => {
    for (const { id } of factsJson) {
      const f = getFact(id)!;
      expect(f.source_url).toMatch(/^https:\/\//);
      for (const n of f.numbers) expect(numbersIn(f.text)).toContain(n);
    }
  });

  it("returns null for unknown entities", () => {
    expect(retrieveBundle("player:nobody")).toBeNull();
  });
});
