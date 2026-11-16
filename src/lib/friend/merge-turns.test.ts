import { describe, expect, it } from "vitest";
import { mergeTurns } from "./service";

describe("mergeTurns", () => {
  it("joins back-to-back turns left by an interruption and drops empty replies", () => {
    expect(
      mergeTurns([
        { role: "system", content: "S" },
        { role: "user", content: "Who's the best finisher" },
        { role: "assistant", content: "" },
        { role: "user", content: "in IPL history?" },
      ]),
    ).toEqual([
      { role: "system", content: "S" },
      { role: "user", content: "Who's the best finisher\nin IPL history?" },
    ]);
  });

  it("leaves a normal alternating conversation alone", () => {
    const msgs = [
      { role: "system" as const, content: "S" },
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hey" },
      { role: "user" as const, content: "who won?" },
    ];
    expect(mergeTurns(msgs)).toEqual(msgs);
  });
});
