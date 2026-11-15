import { describe, expect, it } from "vitest";
import { toResearchFacts } from "./research";

const sources = [
  { title: "Match report", url: "https://www.espncricinfo.com/series/x/final-report" },
  { title: "AP", url: "https://apnews.com/article/abc" },
];
const today = "2026-11-15";

describe("toResearchFacts", () => {
  it("ties each fact to the page it came from, by domain", () => {
    const out = toResearchFacts(
      [
        { text: "RCB beat Punjab Kings by 6 runs in Ahmedabad on 3 June 2025.", source: "apnews.com" },
        { text: "Krunal Pandya took 2 for 17 in 4 overs in the final.", source: "ESPNcricinfo.com" },
      ],
      sources,
      "match:ipl-2025-final",
      today,
    );
    expect(out.map((f) => f.source_url)).toEqual(["https://apnews.com/article/abc", "https://www.espncricinfo.com/series/x/final-report"]);
    expect(out.map((f) => f.domain)).toEqual(["apnews.com", "espncricinfo.com"]);
  });

  it("gives ids, numbers and a web label, and is never marked verified", () => {
    const [f] = toResearchFacts([{ text: "Kohli made 43 off 35 balls in the 2025 final.", source: "apnews.com" }], sources, "player:virat-kohli", today);
    expect(f).toMatchObject({ id: "w-1", origin: "web", verified: false, entities: ["player:virat-kohli"], as_of: today });
    expect(f.numbers).toEqual(expect.arrayContaining([43, 35, 2025]));
  });

  it("falls back to the first page when the named site isn't among the results", () => {
    const [f] = toResearchFacts([{ text: "Gujarat Titans won the title in their first season, 2022.", source: "unknown-blog.com" }], sources, "team:gt", today);
    expect(f.source_url).toBe(sources[0].url);
  });

  it("returns nothing when the search found no pages (nothing to trust)", () => {
    expect(toResearchFacts([{ text: "Something that sounds plausible but has no source.", source: "x.com" }], [], "team:gt", today)).toEqual([]);
  });

  it("drops duplicates, too-short and too-long items, and caps the list", () => {
    const raw = [
      { text: "Too short.", source: "apnews.com" },
      { text: "A".repeat(400), source: "apnews.com" },
      { text: "RCB won the 2025 title after 18 years of waiting.", source: "apnews.com" },
      { text: "rcb won the 2025 title after 18 years of waiting.", source: "apnews.com" },
      ...Array.from({ length: 12 }, (_, i) => ({ text: `A different, specific fact number ${i} about the topic here.`, source: "apnews.com" })),
    ];
    const out = toResearchFacts(raw, sources, "team:rcb", today);
    expect(out).toHaveLength(8);
    expect(out[0].id).toBe("w-1");
    expect(out.filter((f) => f.text.toLowerCase().includes("won the 2025 title"))).toHaveLength(1);
  });
});
