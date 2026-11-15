import { describe, expect, it } from "vitest";
import { sourcesFrom } from "./openrouter";

const cite = (url: string, title?: string) => ({ type: "url_citation", url_citation: { url, title } });

describe("sourcesFrom", () => {
  it("keeps readable, de-duplicated sources", () => {
    const s = sourcesFrom([cite("https://pkl.com.in/winners-list/", "PKL Winners"), cite("https://pkl.com.in/winners-list/", "dup"), cite("https://www.cricinfo.com/x")]);
    expect(s).toEqual([
      { title: "PKL Winners", url: "https://pkl.com.in/winners-list/" },
      { title: "cricinfo.com", url: "https://www.cricinfo.com/x" }, // no title → the site name
    ]);
  });
  it("drops non-web links and junk, and caps the list", () => {
    const s = sourcesFrom([
      cite("javascript:alert(1)", "bad"),
      cite("data:text/html,hi", "bad"),
      cite("not a url", "bad"),
      { type: "other" },
      ...["a", "b", "c", "d", "e", "f"].map((h) => cite(`https://${h}.com/`, h)),
    ]);
    expect(s.map((x) => x.title)).toEqual(["a", "b", "c", "d"]);
  });
  it("handles nothing", () => {
    expect(sourcesFrom(undefined)).toEqual([]);
  });
});
