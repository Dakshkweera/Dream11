import { describe, expect, it } from "vitest";
import { correctNames } from "./names";

const squad = ["Virat Kohli", "MS Dhoni", "Ravindra Jadeja", "Josh Hazlewood", "Bhuvneshwar Kumar", "Ruturaj Gaikwad", "Matheesha Pathirana"];

describe("correctNames", () => {
  it("fixes near-miss spellings of squad names", () => {
    expect(correctNames("Jadeya swings and Kohly runs through.", squad)).toBe("Jadeja swings and Kohli runs through.");
    expect(correctNames("Hazelwood to Gaikwad, beaten.", squad)).toBe("Hazlewood to Gaikwad, beaten.");
    expect(correctNames("Bhuvneswar Kumar comes in.", squad)).toBe("Bhuvneshwar Kumar comes in.");
  });

  it("keeps possessives and punctuation", () => {
    expect(correctNames("What a catch by Jadeya! Kohly's gone.", squad)).toBe("What a catch by Jadeja! Kohli's gone.");
  });

  it("leaves correct names and ordinary words alone", () => {
    const t = "Dhoni walks in. Good length, full and wide. Kohli watches from Chennai.";
    expect(correctNames(t, squad)).toBe(t);
  });

  it("only touches capitalised words, so ordinary lowercase words survive", () => {
    expect(correctNames("a kohly lookalike", squad)).toBe("a kohly lookalike");
  });

  it("does not rewrite words that are too different", () => {
    expect(correctNames("Patel and Sharma and Russell are not here.", squad)).toBe("Patel and Sharma and Russell are not here.");
  });

  it("does nothing without a squad", () => {
    expect(correctNames("Jadeya", [])).toBe("Jadeya");
  });
});
