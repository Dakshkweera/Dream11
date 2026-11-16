/**
 * Cricsheet ball-by-ball → full batting and bowling scorecards.
 *
 * Every number is counted from the deliveries in the source file. Formulas (standard scorecard conventions):
 * - Balls faced: every delivery the batter received except wides (no-balls count as balls faced).
 * - Fours / sixes: 4 or 6 off the bat, unless Cricsheet marks the runs as run (non_boundary).
 * - Strike rate: runs ÷ balls faced × 100.
 * - Legal balls (bowling): deliveries that are neither wides nor no-balls.
 * - Runs conceded: runs off the bat + wides + no-balls. Byes, leg byes and penalty runs aren't charged.
 * - Bowler's wickets: bowled, caught, caught and bowled, lbw, stumped, hit wicket. Run outs etc. aren't credited.
 * - Maiden: a complete over (6 legal balls) by one bowler with no runs charged to him.
 * - Economy: runs conceded ÷ (legal balls ÷ 6).
 */
import type { CricsheetMatch } from "../match/cricsheet";
import type { CricketBatting, CricketBowling, CricketInnings, MatchStats, PlayerMatchStats } from "./schema";

/** Cricsheet's delivery, with the fields scorecards need (the watch-along importer uses a narrower view). */
type Delivery = {
  batter: string;
  bowler: string;
  non_striker?: string;
  runs: { batter: number; extras: number; total: number; non_boundary?: boolean };
  extras?: { wides?: number; noballs?: number; byes?: number; legbyes?: number; penalty?: number };
  wickets?: { player_out: string; kind: string; fielders?: { name?: string; substitute?: boolean }[] }[];
};
export type CricsheetFile = {
  info: CricsheetMatch["info"] & { registry?: { people?: Record<string, string> }; outcome?: unknown };
  innings: { team: string; overs: { over: number; deliveries: Delivery[] }[]; target?: { runs: number; overs?: number } }[];
};

const BOWLER_WICKETS = new Set(["bowled", "caught", "caught and bowled", "lbw", "stumped", "hit wicket"]);
/** Dismissals that don't count as a wicket for the team total. */
const NOT_A_WICKET = new Set(["retired hurt", "retired not out"]);

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const strikeRate = (runs: number, balls: number) => (balls > 0 ? round2((runs / balls) * 100) : null);
export const economy = (runs: number, legalBalls: number) => (legalBalls > 0 ? round2(runs / (legalBalls / 6)) : null);
export const oversFromBalls = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

const isWide = (d: Delivery) => !!d.extras?.wides;
const isNoBall = (d: Delivery) => !!d.extras?.noballs;
const chargedToBowler = (d: Delivery) => d.runs.batter + (d.extras?.wides ?? 0) + (d.extras?.noballs ?? 0);

type Opts = {
  matchId: string;
  /** Cricsheet team name → our team id. */
  teamIdOf: (team: string) => string;
  /** Cricsheet player name (+ registry id) → our player id and display name. */
  playerOf: (name: string, registryId: string | undefined) => { id: string; name: string };
  source: MatchStats["source"];
  sourceUrl: string;
};

/** Build the full scorecard for every innings in the file. */
export function scorecardFromCricsheet(cs: CricsheetFile, o: Opts): MatchStats {
  const registry = cs.info.registry?.people ?? {};
  const who = (name: string) => o.playerOf(name, registry[name]);
  const records = new Map<string, PlayerMatchStats>();
  const teamOfPlayer = new Map<string, string>();
  for (const [team, names] of Object.entries(cs.info.players ?? {})) for (const n of names) teamOfPlayer.set(n, team);

  const record = (name: string): PlayerMatchStats => {
    const p = who(name);
    let r = records.get(p.id);
    if (!r) {
      r = {
        playerId: p.id,
        name: p.name,
        matchId: o.matchId,
        teamId: o.teamIdOf(teamOfPlayer.get(name) ?? ""),
        sport: "cricket",
        stats: { sport: "cricket", batting: null, bowling: null, didNotBat: false },
        source: o.source.name,
        sourceUrl: o.sourceUrl,
        verification: "source-imported",
        classification: "historical",
      };
      records.set(p.id, r);
    }
    return r;
  };

  const innings: CricketInnings[] = cs.innings.map((inn, i) => {
    const bat = new Map<string, CricketBatting>();
    const bowl = new Map<string, CricketBowling & { overRuns: Map<number, { legal: number; runs: number }> }>();
    const battingOrder: string[] = [];
    const bowlingOrder: string[] = [];
    const extras = { byes: 0, legbyes: 0, wides: 0, noballs: 0, penalty: 0, total: 0 };
    let runs = 0;
    let wickets = 0;
    let legal = 0;

    const batter = (name: string) => {
      if (!bat.has(name)) {
        battingOrder.push(name);
        bat.set(name, { position: battingOrder.length, runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: null, notOut: true, dismissal: null });
      }
      return bat.get(name)!;
    };
    const bowler = (name: string) => {
      if (!bowl.has(name)) {
        bowlingOrder.push(name);
        bowl.set(name, { balls: 0, overs: "0.0", maidens: 0, runs: 0, wickets: 0, economy: null, dots: 0, wides: 0, noballs: 0, overRuns: new Map() });
      }
      return bowl.get(name)!;
    };

    for (const over of inn.overs) {
      for (const d of over.deliveries) {
        const b = batter(d.batter);
        if (d.non_striker) batter(d.non_striker);
        const bw = bowler(d.bowler);
        const wide = isWide(d);
        const noball = isNoBall(d);

        runs += d.runs.total;
        for (const k of ["byes", "legbyes", "wides", "noballs", "penalty"] as const) extras[k] += d.extras?.[k] ?? 0;

        // Batter
        b.runs += d.runs.batter;
        if (!wide) b.balls++;
        if (!d.runs.non_boundary) {
          if (d.runs.batter === 4) b.fours++;
          if (d.runs.batter === 6) b.sixes++;
        }

        // Bowler
        const charged = chargedToBowler(d);
        bw.runs += charged;
        if (wide) bw.wides = (bw.wides ?? 0) + 1;
        if (noball) bw.noballs = (bw.noballs ?? 0) + 1;
        const ov = bw.overRuns.get(over.over) ?? { legal: 0, runs: 0 };
        ov.runs += charged;
        if (!wide && !noball) {
          bw.balls++;
          legal++;
          ov.legal++;
          if (d.runs.total === 0) bw.dots++;
        }
        bw.overRuns.set(over.over, ov);

        // Wickets
        for (const w of d.wickets ?? []) {
          if (!NOT_A_WICKET.has(w.kind)) wickets++;
          const credited = BOWLER_WICKETS.has(w.kind);
          if (credited) bw.wickets++;
          const out = batter(w.player_out);
          out.notOut = false;
          out.dismissal = {
            kind: w.kind,
            bowler: credited ? who(d.bowler).name : null,
            fielders: (w.fielders ?? []).map((f) => (f.name ? who(f.name).name : "substitute")),
          };
        }
      }
    }
    extras.total = extras.byes + extras.legbyes + extras.wides + extras.noballs + extras.penalty;

    // Finish each bowler: maidens, overs, economy.
    for (const bw of bowl.values()) {
      bw.maidens = [...bw.overRuns.values()].filter((v) => v.legal === 6 && v.runs === 0).length;
      bw.overs = oversFromBalls(bw.balls);
      bw.economy = economy(bw.runs, bw.balls);
    }
    for (const b of bat.values()) b.strikeRate = strikeRate(b.runs, b.balls);

    // Store on each player's record.
    for (const [name, b] of bat) record(name).stats = { ...(record(name).stats as PlayerMatchStats["stats"] & { sport: "cricket" }), batting: b };
    for (const [name, bw] of bowl) {
      const { overRuns: _o, ...clean } = bw;
      void _o;
      record(name).stats = { ...(record(name).stats as PlayerMatchStats["stats"] & { sport: "cricket" }), bowling: clean };
    }

    const team = inn.team;
    const xi = cs.info.players?.[team] ?? [];
    const didNotBat = xi.filter((n) => !bat.has(n));
    for (const n of didNotBat) {
      const r = record(n);
      r.stats = { ...(r.stats as PlayerMatchStats["stats"] & { sport: "cricket" }), didNotBat: true };
    }

    return {
      number: i + 1,
      teamId: o.teamIdOf(team),
      runs,
      wickets,
      balls: legal,
      overs: oversFromBalls(legal),
      extras,
      target: inn.target?.runs ?? null,
      battingOrder: battingOrder.map((n) => who(n).id),
      bowlingOrder: bowlingOrder.map((n) => who(n).id),
      didNotBat: didNotBat.map((n) => who(n).id),
    };
  });

  return {
    matchId: o.matchId,
    sport: "cricket",
    classification: "historical",
    verification: "source-imported",
    source: o.source,
    notes: [],
    cricket: { innings },
    players: [...records.values()],
  };
}

/**
 * Check a scorecard against the source deliveries and against itself. Returns problems (empty = all good).
 * - Batters' runs + extras = innings total.
 * - Bowlers' runs + byes + leg byes + penalty = innings total.
 * - Total wickets = dismissals listed on the batting card.
 * - Bowlers' legal balls = the innings' legal balls.
 */
export function validateScorecard(cs: CricsheetFile, ms: MatchStats): string[] {
  const problems: string[] = [];
  const byId = new Map(ms.players.map((p) => [p.playerId, p]));
  for (const inn of ms.cricket?.innings ?? []) {
    const src = cs.innings[inn.number - 1];
    const srcRuns = src.overs.flatMap((o) => o.deliveries).reduce((n, d) => n + d.runs.total, 0);
    if (srcRuns !== inn.runs) problems.push(`Innings ${inn.number}: total ${inn.runs} ≠ source ${srcRuns}`);

    const batting = inn.battingOrder.map((id) => byId.get(id)?.stats).map((s) => (s?.sport === "cricket" ? s.batting : null));
    const batRuns = batting.reduce((n, b) => n + (b?.runs ?? 0), 0);
    if (batRuns + inn.extras.total !== inn.runs)
      problems.push(`Innings ${inn.number}: batters ${batRuns} + extras ${inn.extras.total} ≠ total ${inn.runs}`);

    const bowling = inn.bowlingOrder.map((id) => byId.get(id)?.stats).map((s) => (s?.sport === "cricket" ? s.bowling : null));
    const bowlRuns = bowling.reduce((n, b) => n + (b?.runs ?? 0), 0);
    const notCharged = inn.extras.byes + inn.extras.legbyes + inn.extras.penalty;
    if (bowlRuns + notCharged !== inn.runs)
      problems.push(`Innings ${inn.number}: bowlers ${bowlRuns} + byes/leg byes/penalty ${notCharged} ≠ total ${inn.runs}`);

    const bowlBalls = bowling.reduce((n, b) => n + (b?.balls ?? 0), 0);
    if (bowlBalls !== inn.balls) problems.push(`Innings ${inn.number}: bowlers' legal balls ${bowlBalls} ≠ innings ${inn.balls}`);

    const outs = batting.filter((b) => b && !b.notOut && b.dismissal && !NOT_A_WICKET.has(b.dismissal.kind)).length;
    if (outs !== inn.wickets) problems.push(`Innings ${inn.number}: ${outs} dismissals on the card ≠ ${inn.wickets} wickets`);
  }
  return problems;
}
