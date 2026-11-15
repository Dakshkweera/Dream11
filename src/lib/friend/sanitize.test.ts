import { describe, expect, it } from "vitest";
import { stripFactIds } from "./sanitize";

describe("stripFactIds", () => {
  it("removes citation markers and the space before them", () => {
    expect(stripFactIds("He is a finisher [f-0026]. CSK won [f-0056] in 2011.")).toBe("He is a finisher. CSK won in 2011.");
  });
  it("removes several markers in a row", () => {
    expect(stripFactIds("Big night [f-0001][f-0002] indeed")).toBe("Big night indeed");
  });
  it("removes a marker still arriving at the end of a streamed message", () => {
    expect(stripFactIds("He won it [f-00")).toBe("He won it");
  });
  it("turns markdown links into their text", () => {
    expect(stripFactIds("according to [Sports Adda](https://www.sportsadda.asia/kabaddi/x?a=1), Delhi won")).toBe("according to Sports Adda, Delhi won");
  });
  it("leaves normal text, brackets and numbers alone", () => {
    expect(stripFactIds("Score was [149/8] in over 18.3")).toBe("Score was [149/8] in over 18.3");
  });
});
