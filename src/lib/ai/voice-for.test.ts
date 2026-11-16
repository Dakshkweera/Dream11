import { describe, expect, it } from "vitest";
import { voiceFor } from "./models";

describe("voiceFor", () => {
  it("keeps the Indian English voice for English and Hinglish", () => {
    expect(voiceFor("Arre yaar, what a match!", "en-IN-AaravNeural")).toBe("en-IN-AaravNeural");
  });
  it("hands Hindi script to the matching Hindi voice", () => {
    expect(voiceFor("अरे यार, क्या मैच था!", "en-IN-AaravNeural")).toBe("hi-IN-MadhurNeural");
    expect(voiceFor("अरे यार, क्या मैच था!", "en-IN-NeerjaNeural")).toBe("hi-IN-SwaraNeural");
  });
  it("leaves voices without a Hindi partner alone", () => {
    expect(voiceFor("अरे यार", "roger")).toBe("roger");
  });
});
