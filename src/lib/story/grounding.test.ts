import { describe, expect, it } from "vitest";
import type { Fact } from "../facts/schema";
import { checkGrounding, numbersIn, repairCitations } from "./grounding";

const fact = (id: string, text: string, numbers: number[]): Fact => ({
  id,
  entities: ["player:virat-kohli"],
  type: "record",
  text,
  numbers,
  source_url: "https://example.org",
  as_of: "2025-06-03",
  verified: true,
});

const facts = [
  fact("f-1", "Virat Kohli scored 973 runs in the 2016 IPL season.", [973, 2016]),
  fact("f-2", "RCB won their first title in 2025 after 17 seasons.", [2025, 17]),
];

describe("numbersIn", () => {
  it("reads integers, decimals, thousands and ordinals", () => {
    expect(numbersIn("He made 973 runs in 2016, a 4.5 average, 1,200 balls, his 18th season")).toEqual([
      973, 2016, 4.5, 1200, 18,
    ]);
  });
});

describe("checkGrounding", () => {
  it("accepts a story whose numbers all come from cited facts", () => {
    expect(checkGrounding("In 2016 Kohli piled up 973 runs.", ["f-1"], facts)).toEqual({ ok: true });
  });

  it("rejects invented numbers", () => {
    const r = checkGrounding("Kohli hit 4 centuries and 973 runs in 2016.", ["f-1"], facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join()).toContain("4");
  });

  it("rejects numbers from facts that were not cited", () => {
    expect(checkGrounding("RCB waited 17 seasons.", ["f-1"], facts).ok).toBe(false);
  });

  it("rejects unknown or missing citations", () => {
    expect(checkGrounding("Kohli is great.", ["f-99"], facts).ok).toBe(false);
    expect(checkGrounding("Kohli is great.", [], facts).ok).toBe(false);
  });
});

describe("repairCitations", () => {
  const pool = [
    fact("f-1", "Virat Kohli scored 973 runs in the 2016 IPL season.", [973, 2016]),
    fact("f-2", "RCB won their first title in 2025 after 17 seasons.", [2025, 17]),
  ];

  it("cites the fact a number really came from when the draft forgot to", () => {
    const cited = repairCitations("In 2016 Kohli piled up 973 runs, and RCB waited 17 seasons.", ["f-1"], pool);
    expect(cited).toEqual(["f-1", "f-2"]);
    expect(checkGrounding("In 2016 Kohli piled up 973 runs, and RCB waited 17 seasons.", cited, pool)).toEqual({ ok: true });
  });

  it("does not rescue a number that is in no fact at all", () => {
    const body = "Kohli hit 4 centuries and 973 runs in 2016.";
    const cited = repairCitations(body, ["f-1"], pool);
    expect(cited).toEqual(["f-1"]);
    expect(checkGrounding(body, cited, pool).ok).toBe(false);
  });

  it("leaves a fully cited draft unchanged", () => {
    expect(repairCitations("973 runs in 2016.", ["f-1"], pool)).toEqual(["f-1"]);
  });

  it("drops citations to facts that do not exist", () => {
    expect(repairCitations("973 runs.", ["f-1", "f-99"], pool)).toEqual(["f-1"]);
  });
});
