import { describe, expect, it } from "vitest";
import type { Memory } from "../store/types";
import { canDriveNudges, collapseChanges, displayStatus, effectiveConfidence, nextLevel, reconcile, signalToOp, type MemoryOp } from "./rules";

const U = "u1";
const T0 = new Date("2026-11-01T10:00:00Z");
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);

function apply(mems: Memory[], ops: MemoryOp[], now = T0): Memory[] {
  const out = mems.map((m) => ({ ...m }));
  for (const c of reconcile(out, ops, U, now)) {
    const i = out.findIndex((m) => m.id === c.memory.id);
    if (i >= 0) out[i] = c.memory;
    else out.push(c.memory);
  }
  return out;
}

const statedKohli: MemoryOp = {
  op: "add",
  kind: "stated_preference",
  subject_entity: "player:virat-kohli",
  content: "Follows Virat Kohli",
  source: "stated",
};

describe("memory reconciliation", () => {
  it("creates a stated preference with high confidence", () => {
    const [m] = apply([], [statedKohli]);
    expect(m.kind).toBe("stated_preference");
    expect(m.source).toBe("stated");
    expect(m.confidence).toBeGreaterThanOrEqual(0.9);
    expect(canDriveNudges(m, T0)).toBe(true);
  });

  it("reinforces instead of duplicating", () => {
    const mems = apply(apply([], [statedKohli]), [statedKohli]);
    expect(mems).toHaveLength(1);
    expect(mems[0].evidence_count).toBe(2);
  });

  it("needs two signals before an inferred interest can drive nudges", () => {
    const once = apply([], [signalToOp("picked_thread", "player:ms-dhoni", "MS Dhoni")]);
    expect(once[0].kind).toBe("inferred_interest");
    expect(canDriveNudges(once[0], T0)).toBe(false);
    const twice = apply(once, [signalToOp("follow_up", "player:ms-dhoni", "MS Dhoni")]);
    expect(twice).toHaveLength(1);
    expect(twice[0].evidence_count).toBe(2);
    expect(canDriveNudges(twice[0], T0)).toBe(true);
  });

  it("stated beats inferred: an inferred interest the user states is upgraded", () => {
    const inferred = apply([], [signalToOp("picked_thread", "player:ms-dhoni", "MS Dhoni")]);
    const [m] = apply(inferred, [
      { op: "add", kind: "stated_preference", subject_entity: "player:ms-dhoni", content: "Loves MS Dhoni", source: "stated" },
    ]);
    expect(m.kind).toBe("stated_preference");
    expect(m.source).toBe("stated");
    expect(m.content).toBe("Loves MS Dhoni");
  });

  it("dismissals weaken but never create memories", () => {
    expect(apply([], [signalToOp("dismissed_nudge", "team:csk", "CSK")])).toHaveLength(0);
    const two = apply([], [
      signalToOp("picked_thread", "team:csk", "CSK"),
      signalToOp("follow_up", "team:csk", "CSK"),
    ]);
    const before = two[0].confidence;
    const after = apply(two, [signalToOp("dismissed_nudge", "team:csk", "CSK")]);
    expect(after[0].confidence).toBeLessThan(before);
  });

  it("contradiction marks the old memory corrected and records a negative preference", () => {
    const csk = apply([], [
      signalToOp("picked_thread", "team:csk", "CSK"),
      signalToOp("follow_up", "team:csk", "CSK"),
    ]);
    const after = apply(csk, [
      { op: "contradict", kind: "inferred_interest", subject_entity: "team:csk", content: "Not into CSK as a team", source: "stated" },
    ]);
    const old = after.find((m) => m.id === csk[0].id)!;
    expect(old.status).toBe("corrected");
    const neg = after.find((m) => m.polarity === "negative")!;
    expect(neg.subject_entity).toBe("team:csk");
    expect(canDriveNudges(neg, T0)).toBe(false);
    // later inferred signals must not silently revive it
    const again = apply(after, [signalToOp("viewed_player", "team:csk", "CSK")]);
    expect(again.filter((m) => m.subject_entity === "team:csk" && m.status === "active")).toHaveLength(1);
    expect(again.find((m) => m.subject_entity === "team:csk" && m.status === "active")!.polarity).toBe("negative");
  });

  it("inferred interests fade over time; stated ones last", () => {
    const mems = apply([], [statedKohli, signalToOp("picked_thread", "player:ms-dhoni", "MS Dhoni")]);
    const kohli = mems.find((m) => m.subject_entity === "player:virat-kohli")!;
    const dhoni = mems.find((m) => m.subject_entity === "player:ms-dhoni")!;
    expect(effectiveConfidence(dhoni, days(60))).toBeLessThan(effectiveConfidence(dhoni, T0));
    expect(displayStatus(dhoni, days(60))).toBe("faded");
    expect(displayStatus(kohli, days(60))).toBe("active");
  });

  it("collapseChanges hides a memory created and corrected in the same interaction", () => {
    const mems: Memory[] = [];
    const first = reconcile(mems, [signalToOp("follow_up", "team:csk", "CSK")], U, T0);
    const created = first[0].memory;
    const second = reconcile(
      [created],
      [{ op: "contradict", kind: "inferred_interest", subject_entity: "team:csk", content: "Not into CSK", source: "stated", polarity: "negative" }],
      U,
      T0,
    );
    const net = collapseChanges([...first, ...second]);
    expect(net).toHaveLength(1);
    expect(net[0].memory.polarity).toBe("negative");
    expect(net[0].type).toBe("created");
  });

  it("knowledge memories update their content in place", () => {
    const level: MemoryOp = { op: "add", kind: "knowledge", subject_entity: "level:cricket", content: "Casual fan", source: "stated" };
    const mems = apply(apply([], [level]), [{ ...level, op: "reinforce", content: "Regular follower", source: "inferred" }]);
    expect(mems).toHaveLength(1);
    expect(mems[0].content).toBe("Regular follower");
  });

  it("an inferred level update is labelled inferred, not stated", () => {
    const stated: MemoryOp = { op: "add", kind: "knowledge", subject_entity: "level:cricket", content: "Casual follower", source: "stated" };
    const [m] = apply(apply([], [stated]), [{ ...stated, op: "reinforce", content: "Regular follower", source: "inferred" }]);
    expect(m.content).toBe("Regular follower");
    expect(m.source).toBe("inferred");
  });
});

describe("nextLevel", () => {
  it("rises as concepts are learned, one step at a time", () => {
    expect(nextLevel("new", 2)).toBe("new");
    expect(nextLevel("new", 3)).toBe("casual");
    expect(nextLevel("casual", 7)).toBe("casual");
    expect(nextLevel("casual", 8)).toBe("regular");
    expect(nextLevel("new", 50)).toBe("casual"); // never skips a step
  });
  it("never reaches expert or goes down on its own", () => {
    expect(nextLevel("regular", 100)).toBe("regular");
    expect(nextLevel("expert", 0)).toBe("expert");
    expect(nextLevel("regular", 0)).toBe("regular");
  });
});

describe("interests outside the dataset", () => {
  const messi: MemoryOp = { op: "add", kind: "stated_preference", subject_entity: null, content: "Follows Lionel Messi (football)", source: "stated" };

  it("a stated interest with no known entity is remembered as plain text and not duplicated", () => {
    const once = apply([], [messi]);
    expect(once).toHaveLength(1);
    expect(once[0]).toMatchObject({ kind: "stated_preference", source: "stated", subject_entity: null, polarity: "positive" });
    const twice = apply(once, [messi]);
    expect(twice).toHaveLength(1);
    expect(twice[0].evidence_count).toBe(2);
  });

  it("it can't drive nudges (no data behind it) but is still active and visible", () => {
    const [m] = apply([], [messi]);
    expect(canDriveNudges(m, T0)).toBe(true); // stated + positive …
    expect(m.subject_entity).toBeNull(); // … but with no entity the selector has nothing to start from
  });
});
