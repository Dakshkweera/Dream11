import { describe, expect, it } from "vitest";
import type { Profile } from "../memory/service";
import { buildSuggestions } from "./suggestions";

const profile = (over: Partial<Profile> = {}): Profile => ({
  memories: [],
  interests: [],
  negatives: new Set(),
  level: "casual",
  levels: {},
  learned: [],
  learnedEntities: new Set(),
  discoveries: [],
  picks: [],
  ...over,
});

describe("buildSuggestions", () => {
  it("is personalised: different fans get different chips", () => {
    const kohli = buildSuggestions({ profile: profile({ interests: [{ entityId: "player:virat-kohli", weight: 0.9, source: "stated" }] }), onScreen: [], recentlyDiscussed: [] });
    const rohit = buildSuggestions({ profile: profile({ interests: [{ entityId: "player:rohit-sharma", weight: 0.9, source: "stated" }] }), onScreen: [], recentlyDiscussed: [] });
    expect(kohli.join("|")).not.toEqual(rohit.join("|"));
    expect(kohli.join(" ")).toMatch(/Kohli|Dhoni|Royal Challengers/);
    expect(rohit.join(" ")).toMatch(/Rohit|Bumrah|Suryakumar|Mumbai/);
  });

  it("offers a jargon explainer to learners, but not for a concept they already learned", () => {
    const learner = profile({ level: "new", interests: [{ entityId: "player:virat-kohli", weight: 0.9, source: "stated" }] });
    expect(buildSuggestions({ profile: learner, onScreen: [], recentlyDiscussed: [] }).join(" ")).toMatch(/What's an? /);
    const learned = profile({
      level: "new",
      interests: learner.interests,
      learnedEntities: new Set(["topic:finisher", "topic:yorker", "topic:dls", "topic:orange-cap"]),
    });
    expect(buildSuggestions({ profile: learned, onScreen: [], recentlyDiscussed: [] }).join(" ")).not.toMatch(/What's an? /);
  });

  it("picks the explainer that connects to the fan's own interests", () => {
    const bumrahFan = profile({ level: "new", interests: [{ entityId: "player:jasprit-bumrah", weight: 0.9, source: "stated" }] });
    const chips = buildSuggestions({ profile: bumrahFan, onScreen: [], recentlyDiscussed: [], max: 5 });
    expect(chips).toContain("What's a yorker?");
    expect(chips).not.toContain("What's a finisher?");
  });

  it("skips the jargon explainer for experts", () => {
    const expert = profile({ level: "expert", interests: [{ entityId: "player:virat-kohli", weight: 0.9, source: "stated" }] });
    expect(buildSuggestions({ profile: expert, onScreen: [], recentlyDiscussed: [] }).join(" ")).not.toMatch(/What's an? /);
  });

  it("never suggests something the fan rejected", () => {
    const p = profile({
      interests: [{ entityId: "player:ms-dhoni", weight: 0.9, source: "stated" }],
      negatives: new Set(["team:csk"]),
    });
    expect(buildSuggestions({ profile: p, onScreen: ["team:csk"], recentlyDiscussed: [] }).join(" ")).not.toMatch(/Chennai/);
  });

  it("works for a brand-new fan and always returns up to 3 distinct chips", () => {
    const chips = buildSuggestions({ profile: profile(), onScreen: [], recentlyDiscussed: [] });
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.length).toBeLessThanOrEqual(3);
    expect(new Set(chips).size).toBe(chips.length);
  });

  it("uses what is on screen", () => {
    const chips = buildSuggestions({ profile: profile(), onScreen: ["match:ipl-2023-final"], recentlyDiscussed: [] });
    expect(chips.join(" ")).toMatch(/2023 final/);
  });
});
