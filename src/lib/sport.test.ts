import { describe, expect, it } from "vitest";
import { conceptEntities, isConcept, sportOfEntities, sportOfEntity } from "./facts/concepts";
import { shouldComment } from "./friend/live-gate";
import { levelGuide } from "./friend/persona";
import { buildSuggestions } from "./friend/suggestions";
import { allMatches, getMatch } from "./match/data";
import { levelFor, type Profile } from "./memory/service";

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

describe("concepts and sports come from the data", () => {
  it("knows each sport's jargon topics", () => {
    expect(conceptEntities("cricket").map((e) => e.id)).toEqual(expect.arrayContaining(["topic:yorker", "topic:finisher"]));
    expect(conceptEntities("basketball").map((e) => e.id)).toEqual(expect.arrayContaining(["topic:pick-and-roll", "topic:three-pointer"]));
    expect(conceptEntities("basketball").some((e) => e.sport !== "basketball")).toBe(false);
  });

  it("treats jargon as concepts but players as not", () => {
    expect(isConcept("topic:pick-and-roll")).toBe(true);
    expect(isConcept("topic:yorker")).toBe(true);
    expect(isConcept("player:stephen-curry")).toBe(false);
    expect(isConcept(undefined)).toBe(false);
  });

  it("works out the sport of an entity or a screen", () => {
    expect(sportOfEntity("player:stephen-curry")).toBe("basketball");
    expect(sportOfEntity("player:virat-kohli")).toBe("cricket");
    expect(sportOfEntities(["comp:paris-2024-basketball", "player:lebron-james"])).toBe("basketball");
    expect(sportOfEntities([])).toBe("cricket");
  });

  it("has the basketball final as a match with its own clip", () => {
    const m = getMatch("usa-vs-fra")!;
    expect(m.sport).toBe("basketball");
    expect(m.video).toBe("/match/clip-basketball.mp4");
    expect(allMatches().filter((x) => x.sport === "cricket").length).toBeGreaterThan(0);
  });
});

describe("a fan's level is per sport", () => {
  it("a sport they've never mentioned starts at 'new', cricket keeps its own default", () => {
    expect(levelFor(profile(), "basketball")).toBe("new");
    expect(levelFor(profile(), "cricket")).toBe("casual");
  });

  it("a casual cricket fan is still a beginner at basketball, and vice versa", () => {
    const p = profile({ level: "regular", levels: { cricket: "regular", basketball: "casual" } });
    expect(levelFor(p, "cricket")).toBe("regular");
    expect(levelFor(p, "basketball")).toBe("casual");
  });

  it("explanations name the sport and don't assume cricket basics elsewhere", () => {
    expect(levelGuide("new", "basketball")).toContain("new to basketball");
    expect(levelGuide("casual", "cricket")).toContain("runs, wickets, overs");
    expect(levelGuide("casual", "basketball")).not.toContain("wickets");
  });
});

describe("live comments follow the sport", () => {
  const base = { interests: new Set<string>(), learned: new Set<string>() };

  it("speaks about a basketball big moment involving a named player", () => {
    const r = shouldComment({ ...base, sport: "basketball", transcript: "Curry from way downtown, and it's a dagger three-pointer!", mentioned: ["player:stephen-curry"] });
    expect(r.speak).toBe(true);
  });

  it("explains basketball jargon a new fan hasn't learned, once learned it stays quiet", () => {
    const transcript = "They run the pick and roll again, and Davis rolls to the rim.";
    expect(shouldComment({ ...base, sport: "basketball", transcript, mentioned: [] }).speak).toBe(true);
    expect(shouldComment({ ...base, learned: new Set(["topic:pick-and-roll"]), sport: "basketball", transcript, mentioned: [] }).speak).toBe(false);
  });

  it("does not mistake cricket words for basketball moments, or the reverse", () => {
    expect(shouldComment({ ...base, sport: "basketball", transcript: "Great wicket there, a six too.", mentioned: ["player:stephen-curry"] }).speak).toBe(false);
    expect(shouldComment({ ...base, sport: "cricket", transcript: "He rises for the dunk, what a slam.", mentioned: ["player:virat-kohli"] }).speak).toBe(false);
  });

  it("still speaks for a fan's own player in either sport", () => {
    const interests = new Set(["player:lebron-james"]);
    expect(shouldComment({ ...base, interests, sport: "basketball", transcript: "LeBron brings it up the floor.", mentioned: ["player:lebron-james"] }).speak).toBe(true);
  });
});

describe("suggestions follow the screen's sport", () => {
  it("on a basketball screen a new fan is offered basketball jargon, not cricket's", () => {
    const chips = buildSuggestions({ profile: profile(), onScreen: ["comp:paris-2024-basketball", "player:stephen-curry"], recentlyDiscussed: [] });
    expect(chips.join(" ")).toMatch(/pick and roll|three-pointer|alley-oop|free throw/i);
    expect(chips.join(" ")).not.toMatch(/finisher|yorker|orange cap|DLS/i);
  });

  it("on a cricket screen it is the reverse", () => {
    const chips = buildSuggestions({ profile: profile(), onScreen: ["player:ms-dhoni"], recentlyDiscussed: [] });
    expect(chips.join(" ")).not.toMatch(/pick and roll|alley-oop|free throw/i);
  });

  it("does not offer basic basketball explainers to a basketball regular", () => {
    const p = profile({ levels: { basketball: "regular" } });
    const chips = buildSuggestions({ profile: p, onScreen: ["player:stephen-curry"], recentlyDiscussed: [] });
    expect(chips.join(" ")).not.toMatch(/What's an? /);
  });
});

describe("a profile written for one sport leaves the other sport out", () => {
  const now = new Date("2026-11-15T10:00:00Z");
  const mem = (over: Record<string, unknown>) => ({
    id: Math.random().toString(36).slice(2), user_id: "u", kind: "stated_preference", subject_entity: null, content: "", source: "stated",
    confidence: 0.9, evidence_count: 1, last_reinforced_at: now.toISOString(), status: "active", polarity: "positive", created_at: now.toISOString(), ...over,
  });
  const p = profile({
    memories: [
      mem({ subject_entity: "player:virat-kohli", content: "Follows Virat Kohli" }),
      mem({ subject_entity: "player:stephen-curry", content: "Follows Stephen Curry" }),
      mem({ kind: "inferred_interest", source: "inferred", subject_entity: "player:ms-dhoni", content: "Interested in MS Dhoni" }),
    ] as unknown as Profile["memories"],
    picks: ["player:virat-kohli", "player:lebron-james"],
  });
  // imported lazily to keep the top of the file simple
  it("a basketball profile mentions no cricket interests, picks or players", async () => {
    const { profileToPrompt } = await import("./memory/service");
    const text = profileToPrompt(p, now, "basketball");
    expect(text).toContain("Stephen Curry");
    expect(text).toContain("LeBron James");
    expect(text).not.toMatch(/Kohli|Dhoni/);
    expect(text).toContain("basketball new");
  });
  it("a cricket profile mentions no basketball players", async () => {
    const { profileToPrompt } = await import("./memory/service");
    const text = profileToPrompt(p, now, "cricket");
    expect(text).toContain("Virat Kohli");
    expect(text).not.toMatch(/Curry|LeBron/);
  });
  it("the whole profile (used for chat) includes both", async () => {
    const { profileToPrompt } = await import("./memory/service");
    const text = profileToPrompt(p, now);
    expect(text).toMatch(/Kohli/);
    expect(text).toMatch(/Curry/);
  });
});
