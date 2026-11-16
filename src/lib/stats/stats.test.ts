import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import entities from "../../../data/entities.json";
import matchesJson from "../../../data/matches.json";
import { comparePlayers } from "./compare";
import { economy, oversFromBalls, scorecardFromCricsheet, strikeRate, validateScorecard, type CricsheetFile } from "./cricket";
import { matchStats, matchesWithStats, playerRecords, portraitOf } from "./data";
import { lineOf, provenance, shooting } from "./derive";
import { statsForChat, statsPlayersMentioned } from "./prompt";
import { MatchStats, type PlayerMatchStats } from "./schema";

const src = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "data", "sources", "cricsheet", f), "utf8")) as CricsheetFile;
const find = (matchId: string, name: string) => matchStats(matchId)!.players.find((p) => p.name === name)!;
const opts = {
  matchId: "test",
  teamIdOf: (t: string) => `team:${t.toLowerCase()}`,
  playerOf: (n: string) => ({ id: `p:${n}`, name: n }),
  source: { name: "test", url: "https://example.org/", retrievedAt: "2026-01-01" },
  sourceUrl: "https://example.org/match",
};

describe("cricket formulas", () => {
  it("strike rate, economy and overs", () => {
    expect(strikeRate(43, 35)).toBe(122.86);
    expect(strikeRate(0, 0)).toBeNull();
    expect(economy(17, 24)).toBe(4.25);
    expect(economy(5, 0)).toBeNull();
    expect(oversFromBalls(22)).toBe("3.4");
  });

  // One hand-built over with every awkward case in it.
  const tiny: CricsheetFile = {
    info: { teams: ["A", "B"], players: { A: ["Bat1", "Bat2", "Bat3"], B: ["Bowl1"] } },
    innings: [
      {
        team: "A",
        overs: [
          {
            over: 0,
            deliveries: [
              { batter: "Bat1", non_striker: "Bat2", bowler: "Bowl1", runs: { batter: 0, extras: 1, total: 1 }, extras: { wides: 1 } },
              { batter: "Bat1", non_striker: "Bat2", bowler: "Bowl1", runs: { batter: 4, extras: 1, total: 5 }, extras: { noballs: 1 } },
              { batter: "Bat1", non_striker: "Bat2", bowler: "Bowl1", runs: { batter: 4, extras: 0, total: 4, non_boundary: true } },
              { batter: "Bat1", non_striker: "Bat2", bowler: "Bowl1", runs: { batter: 0, extras: 2, total: 2 }, extras: { byes: 2 } },
              { batter: "Bat2", non_striker: "Bat1", bowler: "Bowl1", runs: { batter: 6, extras: 0, total: 6 } },
              {
                batter: "Bat2",
                non_striker: "Bat1",
                bowler: "Bowl1",
                runs: { batter: 0, extras: 0, total: 0 },
                wickets: [{ player_out: "Bat1", kind: "run out", fielders: [{ name: "Bowl1" }] }],
              },
              { batter: "Bat2", non_striker: "Bat3", bowler: "Bowl1", runs: { batter: 0, extras: 0, total: 0 } },
              { batter: "Bat2", non_striker: "Bat3", bowler: "Bowl1", runs: { batter: 0, extras: 0, total: 0 }, wickets: [{ player_out: "Bat2", kind: "bowled" }] },
            ],
          },
        ],
      },
    ],
  };
  const ms = scorecardFromCricsheet(tiny, opts);
  const bat = (n: string) => (ms.players.find((p) => p.name === n)!.stats as { batting: { runs: number; balls: number; fours: number; sixes: number; notOut: boolean; dismissal: { kind: string; bowler: string | null } | null } }).batting;
  const bowl = (ms.players.find((p) => p.name === "Bowl1")!.stats as { bowling: { balls: number; runs: number; wickets: number; wides: number; noballs: number; maidens: number } }).bowling;

  it("balls faced exclude wides but include no-balls; a run four isn't a boundary", () => {
    expect(bat("Bat1")).toMatchObject({ runs: 8, balls: 3, fours: 1, sixes: 0 }); // wide not faced; no-ball 4 counts; run 4 isn't a "4"
    expect(bat("Bat2")).toMatchObject({ runs: 6, balls: 4, sixes: 1 }); // the run-out ball counts as faced
  });

  it("bowler: byes not charged, run outs not credited, wides and no-balls counted", () => {
    expect(bowl).toMatchObject({ balls: 6, runs: 16, wickets: 1, wides: 1, noballs: 1, maidens: 0 }); // 1 wd + 4 + 1 nb + 4 run + 6; byes not charged
    expect(bat("Bat1")!.dismissal).toMatchObject({ kind: "run out", bowler: null });
    expect(bat("Bat2")!.dismissal).toMatchObject({ kind: "bowled", bowler: "Bowl1" });
  });

  it("the innings adds up both ways", () => {
    const inn = ms.cricket!.innings[0];
    expect(inn.runs).toBe(18);
    expect(inn.extras).toMatchObject({ wides: 1, noballs: 1, byes: 2, total: 4 });
    expect(inn.wickets).toBe(2);
    expect(inn.didNotBat).toEqual([]);
    expect(validateScorecard(tiny, ms)).toEqual([]);
  });
});

describe("imported IPL finals (Cricsheet)", () => {
  it("both scorecards add up against their source files", () => {
    expect(validateScorecard(src("1473511.json"), matchStats("rcb-vs-pbks")!)).toEqual([]);
    expect(validateScorecard(src("1535465.json"), matchStats("rcb-vs-gt")!)).toEqual([]);
  });

  it("totals agree with the match results the app already shows", () => {
    const inn = (id: string) => matchStats(id)!.cricket!.innings.map((i) => `${i.teamId} ${i.runs}/${i.wickets}`);
    expect(inn("rcb-vs-pbks")).toEqual(["team:rcb 190/9", "team:pbks 184/7"]);
    expect(inn("rcb-vs-gt")).toEqual(["team:gt 155/8", "team:rcb 161/5"]);
  });

  it("known performances come out exactly", () => {
    const k25 = find("rcb-vs-pbks", "Virat Kohli").stats;
    expect(k25.sport === "cricket" && k25.batting).toMatchObject({ runs: 43, balls: 35, notOut: false });
    const shashank = find("rcb-vs-pbks", "Shashank Singh").stats;
    expect(shashank.sport === "cricket" && shashank.batting).toMatchObject({ runs: 61, balls: 30, notOut: true });
    const krunal = find("rcb-vs-pbks", "Krunal Pandya").stats;
    expect(krunal.sport === "cricket" && krunal.bowling).toMatchObject({ overs: "4.0", runs: 17, wickets: 2, economy: 4.25 });
    const k26 = find("rcb-vs-gt", "Virat Kohli").stats;
    expect(k26.sport === "cricket" && k26.batting).toMatchObject({ runs: 75, balls: 42, notOut: true });
  });
});

describe("basketball box score (FIBA)", () => {
  const ms = matchStats("usa-vs-fra")!;
  const played = ms.players.filter((p) => p.stats.sport === "basketball" && p.stats.points !== null);

  it("every player's points match their shooting, and rebounds add up", () => {
    for (const p of played) {
      const s = p.stats as Extract<PlayerMatchStats["stats"], { sport: "basketball" }>;
      const twos = s.fgMade! - s.threeMade!;
      expect(2 * twos + 3 * s.threeMade! + s.ftMade!, p.name).toBe(s.points);
      expect(s.offensiveRebounds! + s.defensiveRebounds!, p.name).toBe(s.rebounds);
    }
  });

  it("team points add up to the final score, 98–87", () => {
    const total = (team: string) => played.filter((p) => p.teamId === team).reduce((n, p) => n + ((p.stats as { points: number }).points ?? 0), 0);
    expect(total("team:usa-basketball")).toBe(98);
    expect(total("team:france-basketball")).toBe(87);
  });

  it("uses FIBA's official lines (not ESPN's): Curry 8/12 from three, Booker 6/10", () => {
    const curry = find("usa-vs-fra", "Stephen Curry").stats as { threeMade: number; threeAttempted: number; points: number; minutes: string };
    expect(curry).toMatchObject({ points: 24, threeMade: 8, threeAttempted: 12, minutes: "29:37" });
    const booker = find("usa-vs-fra", "Devin Booker").stats as { fgMade: number; fgAttempted: number };
    expect(booker).toMatchObject({ fgMade: 6, fgAttempted: 10 });
  });

  it("players who didn't play have missing values, not zeros", () => {
    const white = find("usa-vs-fra", "Derrick White").stats;
    expect(white).toMatchObject({ points: null, minutes: null, rebounds: null, note: "Did not play" });
    expect(lineOf(find("usa-vs-fra", "Derrick White"))).toBe("Did not play");
  });

  it("shooting percentages use made ÷ attempted", () => {
    const s = find("usa-vs-fra", "Stephen Curry").stats as Extract<PlayerMatchStats["stats"], { sport: "basketball" }>;
    expect(shooting(s)).toMatchObject({ fgPct: 61.5, threePct: 66.7, ftPct: null, twoMade: 0, twoAttempted: 1 });
  });
});

describe("data integrity", () => {
  const ids = new Set((entities as { id: string }[]).map((e) => e.id));
  const matches = matchesJson as { id: string; teams: string[] }[];

  it("every stats file validates and every record links to a real match, team and (if from the dataset) player", () => {
    for (const id of matchesWithStats()) {
      const ms = MatchStats.parse(matchStats(id));
      const m = matches.find((x) => x.id === ms.matchId);
      expect(m, id).toBeTruthy();
      for (const p of ms.players) {
        expect(p.matchId).toBe(ms.matchId);
        expect(m!.teams, `${p.name} team`).toContain(p.teamId);
        expect(p.sourceUrl).toMatch(/^https:\/\//);
        expect(["historical", "demo", "live"]).toContain(p.classification);
        if (p.playerId.startsWith("player:")) expect(ids.has(p.playerId), p.playerId).toBe(true);
      }
    }
  });

  it("nothing is labelled live or verified that isn't", () => {
    for (const id of matchesWithStats()) {
      const ms = matchStats(id)!;
      expect(ms.classification).toBe("historical");
      expect(ms.verification).not.toBe("hand-verified"); // no person has checked these yet
    }
    expect(provenance(find("usa-vs-fra", "Stephen Curry"))).toContain("awaiting a human check");
    expect(provenance(find("rcb-vs-pbks", "Virat Kohli"))).toContain("imported from the source");
  });

  it("a player's records across matches are found by id", () => {
    expect(playerRecords("player:virat-kohli").map((r) => r.matchId).sort()).toEqual(["rcb-vs-gt", "rcb-vs-pbks"]);
  });

  it("player photos are reusable files from Wikimedia Commons, with a credit", () => {
    const p = portraitOf("player:stephen-curry")!;
    expect(p.sourcePage).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    expect(p.license).toMatch(/^(CC BY|CC0|Public domain|PD|GODL-India)/i);
    expect(p.attribution).toContain(p.author);
    expect(p.attribution).toContain(p.license);
    expect(portraitOf("cricsheet:does-not-exist")).toBeNull();
  });
});

describe("comparison", () => {
  it("refuses to compare across sports", () => {
    const r = comparePlayers(find("rcb-vs-pbks", "Virat Kohli"), find("usa-vs-fra", "Stephen Curry"));
    expect(r.ok).toBe(false);
  });

  it("compares two batters on batting, with the one-match caveat", () => {
    const r = comparePlayers(find("rcb-vs-pbks", "Virat Kohli"), find("rcb-vs-pbks", "Shashank Singh"));
    expect(r.ok && r.rows.find((x) => x.label === "Runs")).toMatchObject({ a: "43", b: "61", better: "b" });
    expect(r.ok && r.caveats.join(" ")).toMatch(/One match each/);
  });

  it("explains when there's nothing fair to compare (a batter against a bowler who didn't bat)", () => {
    const bowlerOnly = matchStats("rcb-vs-pbks")!.players.find((p) => p.stats.sport === "cricket" && p.stats.bowling && !p.stats.batting)!;
    const batterOnly = find("rcb-vs-pbks", "Virat Kohli");
    const r = comparePlayers(batterOnly, bowlerOnly);
    expect(r.ok).toBe(false);
  });

  it("flags different matches", () => {
    const r = comparePlayers(find("rcb-vs-pbks", "Virat Kohli"), find("rcb-vs-gt", "Virat Kohli"));
    expect(r.ok && r.caveats.join(" ")).toMatch(/different matches/);
  });
});

describe("Buzzer's STATS block", () => {
  it("includes the match card, its provenance and the rules when a match is in focus", () => {
    const block = statsForChat({ matchId: "rcb-vs-pbks", playerIds: [], message: "who did well?" });
    expect(block).toContain("Innings 1: RCB 190/9");
    expect(block).toContain("Virat Kohli 43 off 35");
    expect(block).toContain("Historical · Cricsheet");
    expect(block).toContain("STATS RULES");
  });

  it("adds a named player's other matches, and only those", () => {
    const block = statsForChat({ playerIds: [], message: "How did Kohli do compared with before?" });
    expect(block).toContain("Virat Kohli, every match with statistics (2)");
    expect(block).not.toContain("Innings 1");
  });

  it("is empty when nothing relevant has statistics", () => {
    expect(statsForChat({ playerIds: [], message: "Who won the 2011 World Cup?" })).toBe("");
  });

  it("finds players by surname but not by everyday words", () => {
    expect(statsPlayersMentioned("what about Wembanyama")).toContain("player:victor-wembanyama");
    expect(statsPlayersMentioned("is the white ball harder to see")).not.toContain("fiba:derrick-white");
  });
});
