import { describe, expect, it } from "vitest";
import { shouldComment } from "./live-gate";

const base = { interests: new Set<string>(), learned: new Set<string>(), mentioned: [] as string[] };

describe("shouldComment", () => {
  it("stays quiet on filler commentary", () => {
    expect(shouldComment({ ...base, transcript: "Good length, defended back to the bowler. Nothing much happening." }).speak).toBe(false);
    expect(shouldComment({ ...base, transcript: "" }).speak).toBe(false);
  });

  it("speaks when a player the fan cares about is involved", () => {
    const r = shouldComment({ ...base, transcript: "Kohli taps it to cover.", interests: new Set(["player:virat-kohli"]), mentioned: ["player:virat-kohli"] });
    expect(r.speak).toBe(true);
    expect(r.reason).toMatch(/cares about/);
  });

  it("stays quiet when only players the fan doesn't care about are mentioned, with no big moment", () => {
    expect(shouldComment({ ...base, transcript: "Gaikwad works it to square leg.", mentioned: ["player:x"] }).speak).toBe(false);
  });

  it("speaks for jargon the fan hasn't learned, but not once they have", () => {
    const transcript = "That's a perfect yorker, right in the blockhole.";
    expect(shouldComment({ ...base, transcript }).speak).toBe(true);
    expect(shouldComment({ ...base, transcript, learned: new Set(["topic:yorker"]) }).speak).toBe(false);
  });

  it("speaks for a big moment involving named players", () => {
    expect(shouldComment({ ...base, transcript: "Bumrah bowls him! The middle stump is gone, what a wicket.", mentioned: ["player:jasprit-bumrah"] }).speak).toBe(true);
  });

  it("does not treat a big-event word as a moment when nobody is named", () => {
    expect(shouldComment({ ...base, transcript: "That's four more, the crowd loves it." }).speak).toBe(false);
  });
});
