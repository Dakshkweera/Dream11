/**
 * Player statistics: one structured record per player per match, for any sport.
 *
 * Every record carries where its numbers came from, how far they have been checked, and whether they are
 * historical, demo or live. Numbers are only ever written by importers or by hand from a published source;
 * the AI reads them and never writes them. A value that the source does not give stays `null` (missing),
 * never 0 and never estimated.
 */
import { z } from "zod";

/** When the numbers are from: a finished real match, illustrative demo data, or a live feed. */
export const Classification = z.enum(["historical", "demo", "live"]);

/**
 * How far the numbers have been checked.
 * - source-imported: computed by code straight from the source file, with totals checked against it.
 * - hand-entered: typed in from a published source by hand; not yet checked by a second person.
 * - hand-verified: a person has checked every number against the source.
 */
export const Verification = z.enum(["source-imported", "hand-entered", "hand-verified"]);

export const Source = z.object({
  name: z.string(), // "Cricsheet", "FIBA official box score"
  url: z.string().url(),
  license: z.string().optional(),
  /** Credit line to show wherever these numbers are displayed. */
  attribution: z.string().optional(),
  retrievedAt: z.string(), // ISO date
});

const int = z.number().int().nonnegative();
const nInt = int.nullable();

// ---------------------------------------------------------------- cricket

export const Dismissal = z.object({
  /** Cricsheet wording: "caught", "bowled", "lbw", "run out", "stumped", "caught and bowled", … */
  kind: z.string(),
  bowler: z.string().nullable(), // null for run outs and other dismissals the bowler isn't credited with
  fielders: z.array(z.string()).default([]),
});

export const CricketBatting = z.object({
  position: z.number().int().positive(),
  runs: int,
  balls: int,
  fours: int,
  sixes: int,
  /** runs ÷ balls × 100, 2 decimals; null when no balls faced. */
  strikeRate: z.number().nullable(),
  notOut: z.boolean(),
  dismissal: Dismissal.nullable(),
});

export const CricketBowling = z.object({
  /** Legal balls bowled (wides and no-balls excluded). */
  balls: int,
  /** Cricket notation: "3.4" is 3 overs and 4 balls. */
  overs: z.string(),
  maidens: int,
  /** Runs charged to the bowler: off the bat + wides + no-balls (byes and leg byes are not). */
  runs: int,
  wickets: int,
  /** runs ÷ overs (balls ÷ 6), 2 decimals; null when no legal balls. */
  economy: z.number().nullable(),
  dots: int,
  /** Number of wide / no-ball deliveries; null when the source doesn't say. */
  wides: nInt,
  noballs: nInt,
});

export const CricketPlayerStats = z.object({
  sport: z.literal("cricket"),
  batting: CricketBatting.nullable(),
  bowling: CricketBowling.nullable(),
  /** In the XI but didn't bat. */
  didNotBat: z.boolean(),
});

export const Extras = z.object({ byes: int, legbyes: int, wides: int, noballs: int, penalty: int, total: int });

export const CricketInnings = z.object({
  number: z.number().int().positive(),
  teamId: z.string(),
  runs: int,
  wickets: int,
  balls: int, // legal balls
  overs: z.string(),
  extras: Extras,
  target: z.number().int().nullable(),
  /** Player ids in batting order, and in the order they first bowled. */
  battingOrder: z.array(z.string()),
  bowlingOrder: z.array(z.string()),
  didNotBat: z.array(z.string()),
});

// ---------------------------------------------------------------- basketball

export const BasketballPlayerStats = z.object({
  sport: z.literal("basketball"),
  starter: z.boolean().nullable(),
  /** "MM:SS" as published. */
  minutes: z.string().nullable(),
  points: nInt,
  rebounds: nInt,
  offensiveRebounds: nInt,
  defensiveRebounds: nInt,
  assists: nInt,
  steals: nInt,
  blocks: nInt,
  turnovers: nInt,
  fouls: nInt,
  fgMade: nInt,
  fgAttempted: nInt,
  threeMade: nInt,
  threeAttempted: nInt,
  ftMade: nInt,
  ftAttempted: nInt,
  plusMinus: z.number().int().nullable(),
  /** e.g. "DNP" — present only when the player didn't play. */
  note: z.string().optional(),
});

export const BasketballTeam = z.object({
  teamId: z.string(),
  points: int,
  /** Team rebounds etc. that aren't credited to a player, if the box score lists them. */
  teamRebounds: nInt,
  playerOrder: z.array(z.string()),
});

// ---------------------------------------------------------------- shared

export const PlayerStats = z.discriminatedUnion("sport", [CricketPlayerStats, BasketballPlayerStats]);

/** One player's numbers in one match. The shape every screen and Buzzer reads. */
export const PlayerMatchStats = z.object({
  playerId: z.string(), // "player:virat-kohli" when in the dataset, else "cricsheet:<id>" / "fiba:<slug>"
  name: z.string(),
  matchId: z.string(),
  teamId: z.string(),
  sport: z.enum(["cricket", "basketball"]),
  stats: PlayerStats,
  source: z.string(), // source name, repeated on every record on purpose
  sourceUrl: z.string().url(),
  verification: Verification,
  classification: Classification,
});

/** Everything known about one match's statistics: the file in data/stats/<matchId>.json. */
export const MatchStats = z.object({
  matchId: z.string(),
  sport: z.enum(["cricket", "basketball"]),
  classification: Classification,
  verification: Verification,
  source: Source,
  /** Anything about the data a reader should know (e.g. what the source does not include). */
  notes: z.array(z.string()).default([]),
  cricket: z.object({ innings: z.array(CricketInnings) }).optional(),
  basketball: z.object({ teams: z.array(BasketballTeam) }).optional(),
  players: z.array(PlayerMatchStats),
});

/** A player photograph from a source whose licence allows reuse, with everything needed to credit it. */
export const Portrait = z.object({
  playerId: z.string(),
  imageUrl: z.string().url(),
  /** A small version for avatars and tables. */
  thumbUrl: z.string().url(),
  author: z.string(),
  license: z.string(), // "CC BY-SA 4.0"
  licenseUrl: z.string().url().nullable(),
  sourcePage: z.string().url(), // the Commons file page
  attribution: z.string(), // ready-to-show credit line
  checkedAt: z.string(),
});

export type Classification = z.infer<typeof Classification>;
export type Verification = z.infer<typeof Verification>;
export type CricketBatting = z.infer<typeof CricketBatting>;
export type CricketBowling = z.infer<typeof CricketBowling>;
export type CricketPlayerStats = z.infer<typeof CricketPlayerStats>;
export type CricketInnings = z.infer<typeof CricketInnings>;
export type BasketballPlayerStats = z.infer<typeof BasketballPlayerStats>;
export type BasketballTeam = z.infer<typeof BasketballTeam>;
export type PlayerMatchStats = z.infer<typeof PlayerMatchStats>;
export type MatchStats = z.infer<typeof MatchStats>;
export type Portrait = z.infer<typeof Portrait>;
