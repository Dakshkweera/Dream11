import { describe, expect, it } from "vitest";
import { ballsOf, buildTimeline, parseSync, sameNameAs, type CricsheetMatch } from "./cricsheet";

const d = (batter: string, bowler: string, bat: number, extras = 0, more: object = {}) => ({
  batter,
  bowler,
  runs: { batter: bat, extras, total: bat + extras },
  ...more,
});

const fixture: CricsheetMatch = {
  info: { teams: ["Chennai Super Kings", "Royal Challengers Bengaluru"] },
  innings: [
    {
      team: "Chennai Super Kings",
      overs: [
        { over: 18, deliveries: [d("MS Dhoni", "J Hazlewood", 0), d("MS Dhoni", "J Hazlewood", 6), d("MS Dhoni", "J Hazlewood", 0, 1, { extras: { wides: 1 } }), d("MS Dhoni", "J Hazlewood", 1)] },
        { over: 19, deliveries: [d("RA Jadeja", "B Kumar", 4), d("RA Jadeja", "B Kumar", 0, 0, { wickets: [{ player_out: "RA Jadeja", kind: "caught" }] })] },
      ],
    },
  ],
};
const short = (t: string) => (t.startsWith("Chennai") ? "CSK" : "RCB");

describe("ballsOf", () => {
  const balls = ballsOf(fixture, 0, short);

  it("tracks the running score and wickets", () => {
    expect(balls.map((b) => b.score)).toEqual(["0/0", "6/0", "7/0", "8/0", "12/0", "12/1"]);
  });

  it("describes events", () => {
    expect(balls.map((b) => b.event)).toEqual(["DOT", "SIX", "WIDE", "1 RUN", "FOUR", "WICKET — caught"]);
  });

  it("labels balls in cricket notation, an illegal ball sharing the next legal ball's label", () => {
    expect(balls.map((b) => b.label)).toEqual(["18.1", "18.2", "18.3", "18.3", "19.1", "19.2"]);
    expect(balls[2].legal).toBe(false);
  });

  it("rejects a missing innings", () => {
    expect(() => ballsOf(fixture, 1, short)).toThrow(/No innings 2/);
  });
});

describe("buildTimeline", () => {
  const balls = ballsOf(fixture, 0, short);

  it("spreads balls evenly between anchors and includes the last anchor", () => {
    const tl = buildTimeline(balls, parseSync("18.1=10, 19.2=60"));
    expect(tl[0].t).toBe(10);
    expect(tl.at(-1)!.t).toBe(60);
    expect(tl.at(-1)!.event).toContain("WICKET");
    expect(tl.map((b) => b.t)).toEqual([...tl.map((b) => b.t)].sort((a, b) => a - b));
    expect(tl).toHaveLength(6);
  });

  it("only includes balls inside the anchors", () => {
    const tl = buildTimeline(balls, parseSync("18.2=10, 19.1=40"));
    expect(tl.map((b) => b.event)).toEqual(["SIX", "WIDE", "1 RUN", "FOUR"]);
  });

  it("uses piecewise anchors", () => {
    const tl = buildTimeline(balls, parseSync("18.1=0, 18.3=20, 19.2=200"));
    expect(tl.find((b) => b.event === "SIX")!.t).toBe(7); // 1 of 3 deliveries between 0s and 20s
    expect(tl.find((b) => b.event === "FOUR")!.t).toBeGreaterThan(20);
  });

  it("rejects bad input clearly", () => {
    expect(() => parseSync("18.1=10")).toThrow(/at least 2/);
    expect(() => parseSync("18.1=ten, 19.2=60")).toThrow(/Bad sync/);
    expect(() => buildTimeline(balls, parseSync("18.1=10, 25.1=60"))).toThrow(/not found/);
    expect(() => buildTimeline(balls, parseSync("18.1=60, 19.2=10"))).toThrow(/must increase/);
  });
});

describe("sameNameAs", () => {
  it("matches Cricsheet initials to full names", () => {
    expect(sameNameAs("V Kohli", "Virat Kohli")).toBe(true);
    expect(sameNameAs("RA Jadeja", "Ravindra Jadeja")).toBe(true);
    expect(sameNameAs("MS Dhoni", "MS Dhoni")).toBe(true);
    expect(sameNameAs("SA Yadav", "Suryakumar Yadav")).toBe(true);
  });
  it("does not confuse different people", () => {
    expect(sameNameAs("K Pandya", "Hardik Pandya")).toBe(false);
    expect(sameNameAs("V Kohli", "Rohit Sharma")).toBe(false);
  });
});
