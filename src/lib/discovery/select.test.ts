import { describe, expect, it } from "vitest";
import type { Relation } from "../facts/schema";
import { selectDiscovery, type SelectInput } from "./select";

const graph: Record<string, { entityId: string; relation: Relation["type"]; type: string }[]> = {
  kohli: [
    { entityId: "rcb", relation: "plays_for", type: "team" },
    { entityId: "dhoni", relation: "rival_of", type: "player" },
  ],
  dhoni: [
    { entityId: "csk", relation: "captained", type: "team" },
    { entityId: "jadeja", relation: "teammate_of", type: "player" },
    { entityId: "kohli", relation: "rival_of", type: "player" },
  ],
  csk: [{ entityId: "dhoni", relation: "captained", type: "player" }],
  mi: [],
};

const base = (over: Partial<SelectInput>): SelectInput => ({
  interests: [],
  negatives: new Set(),
  onScreen: [],
  recentlyDiscussed: [],
  neighbours: (id) => graph[id] ?? [],
  ...over,
});

describe("selectDiscovery", () => {
  it("leads outward from an interest via a rivalry", () => {
    const c = selectDiscovery(base({ interests: [{ entityId: "kohli", weight: 0.9 }] }))!;
    expect(c.entityId).toBe("dhoni");
    expect(c.because).toEqual({ fromEntity: "kohli", relation: "rival_of" });
  });

  it("does not repeat what was just discussed", () => {
    const c = selectDiscovery(base({ interests: [{ entityId: "kohli", weight: 0.9 }], recentlyDiscussed: ["dhoni"] }))!;
    expect(c.entityId).toBe("rcb");
  });

  it("never surfaces something the fan rejected", () => {
    const c = selectDiscovery(base({ interests: [{ entityId: "dhoni", weight: 0.9 }], negatives: new Set(["csk"]) }))!;
    expect(c.entityId).not.toBe("csk");
  });

  it("evolves: a new interest changes what is surfaced", () => {
    const before = selectDiscovery(base({ interests: [{ entityId: "kohli", weight: 0.9 }] }))!;
    const after = selectDiscovery(
      base({
        interests: [
          { entityId: "kohli", weight: 0.9 },
          { entityId: "dhoni", weight: 0.6 },
        ],
        recentlyDiscussed: ["dhoni"],
      }),
    )!;
    expect(before.entityId).toBe("dhoni");
    expect(after.entityId).toBe("jadeja");
  });

  it("a returning fan gets fresh material before repeats of older discoveries", () => {
    const c = selectDiscovery(
      base({
        interests: [
          { entityId: "dhoni", weight: 0.35 },
          { entityId: "kohli", weight: 0.86 },
        ],
        olderDiscussed: ["rcb", "csk"],
      }),
    )!;
    expect(c.entityId).toBe("jadeja");
  });

  it("prefers on-screen entities linked to an interest", () => {
    const c = selectDiscovery(base({ interests: [{ entityId: "dhoni", weight: 0.6 }], onScreen: ["csk", "mi"] }))!;
    expect(c.entityId).toBe("csk");
  });

  it("returns something for a brand-new fan looking at a page", () => {
    expect(selectDiscovery(base({ onScreen: ["mi"] }))!.entityId).toBe("mi");
    expect(selectDiscovery(base({}))).toBeNull();
  });
});

describe("selectDiscovery with an allow filter", () => {
  it("keeps to one sport: a cricket fan on a basketball screen gets a basketball pick", () => {
    const sport: Record<string, string> = { kohli: "cricket", dhoni: "cricket", rcb: "cricket", curry: "basketball" };
    const input = base({
      interests: [{ entityId: "kohli", weight: 0.9 }],
      onScreen: ["curry"],
      allow: (id) => sport[id] === "basketball",
    });
    expect(selectDiscovery(input)!.entityId).toBe("curry");
    // without the filter the cricket rivalry would win
    expect(selectDiscovery({ ...input, allow: undefined })!.entityId).toBe("dhoni");
  });
});
