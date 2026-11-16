/**
 * Two-player comparison that only compares like with like, and says what it can't compare and why.
 * Safe to import on the client.
 */
import { shooting } from "./derive";
import type { PlayerMatchStats } from "./schema";

export type CompareRow = { label: string; a: string; b: string; better?: "a" | "b" | null; formula?: string };
export type Comparison = { ok: true; rows: CompareRow[]; caveats: string[] } | { ok: false; reason: string };

const better = (a: number | null, b: number | null, higherIsBetter = true): "a" | "b" | null => {
  if (a === null || b === null || a === b) return null;
  return (a > b) === higherIsBetter ? "a" : "b";
};
const v = (n: number | null | undefined, suffix = "") => (n === null || n === undefined ? "—" : `${n}${suffix}`);

export function comparePlayers(a: PlayerMatchStats, b: PlayerMatchStats): Comparison {
  if (a.playerId === b.playerId && a.matchId === b.matchId) return { ok: false, reason: "Pick two different players." };
  if (a.sport !== b.sport) return { ok: false, reason: `A ${a.sport} line and a ${b.sport} line measure different things, so they can't be compared.` };

  const caveats: string[] = [];
  if (a.matchId !== b.matchId) caveats.push("These are from different matches, against different opponents and conditions.");
  caveats.push("One match each: a single game says little about who is the better player overall.");
  if (a.verification !== "source-imported" || b.verification !== "source-imported")
    caveats.push("Some of these numbers were entered by hand and are still awaiting a human check.");

  const sa = a.stats;
  const sb = b.stats;
  if (sa.sport === "basketball" && sb.sport === "basketball") {
    if (sa.points === null || sb.points === null) return { ok: false, reason: "One of these players didn't play, so there's nothing to compare." };
    const ha = shooting(sa);
    const hb = shooting(sb);
    const rows: CompareRow[] = [
      { label: "Minutes", a: sa.minutes ?? "—", b: sb.minutes ?? "—" },
      { label: "Points", a: v(sa.points), b: v(sb.points), better: better(sa.points, sb.points) },
      { label: "Rebounds", a: v(sa.rebounds), b: v(sb.rebounds), better: better(sa.rebounds, sb.rebounds) },
      { label: "Assists", a: v(sa.assists), b: v(sb.assists), better: better(sa.assists, sb.assists) },
      { label: "Steals", a: v(sa.steals), b: v(sb.steals), better: better(sa.steals, sb.steals) },
      { label: "Blocks", a: v(sa.blocks), b: v(sb.blocks), better: better(sa.blocks, sb.blocks) },
      { label: "Turnovers", a: v(sa.turnovers), b: v(sb.turnovers), better: better(sa.turnovers, sb.turnovers, false) },
      { label: "FG%", a: v(ha.fgPct, "%"), b: v(hb.fgPct, "%"), better: better(ha.fgPct, hb.fgPct), formula: "field goals made ÷ attempted" },
      { label: "3P%", a: v(ha.threePct, "%"), b: v(hb.threePct, "%"), better: better(ha.threePct, hb.threePct), formula: "three-pointers made ÷ attempted" },
      { label: "Plus/minus", a: v(sa.plusMinus), b: v(sb.plusMinus), better: better(sa.plusMinus, sb.plusMinus) },
    ];
    const attempts = (n: number | null) => (n ?? 0) < 3;
    if (attempts(sa.fgAttempted) || attempts(sb.fgAttempted)) caveats.push("Very few shots taken, so shooting percentages swing a lot.");
    return { ok: true, rows, caveats };
  }

  if (sa.sport === "cricket" && sb.sport === "cricket") {
    const rows: CompareRow[] = [];
    if (sa.batting && sb.batting) {
      rows.push(
        { label: "Runs", a: v(sa.batting.runs), b: v(sb.batting.runs), better: better(sa.batting.runs, sb.batting.runs) },
        { label: "Balls faced", a: v(sa.batting.balls), b: v(sb.batting.balls) },
        { label: "Strike rate", a: v(sa.batting.strikeRate), b: v(sb.batting.strikeRate), better: better(sa.batting.strikeRate, sb.batting.strikeRate), formula: "runs ÷ balls × 100" },
        { label: "Fours", a: v(sa.batting.fours), b: v(sb.batting.fours), better: better(sa.batting.fours, sb.batting.fours) },
        { label: "Sixes", a: v(sa.batting.sixes), b: v(sb.batting.sixes), better: better(sa.batting.sixes, sb.batting.sixes) },
        { label: "Out?", a: sa.batting.notOut ? "not out" : "out", b: sb.batting.notOut ? "not out" : "out" },
      );
      if (Math.min(sa.batting.balls, sb.batting.balls) < 10) caveats.push("One of them faced fewer than 10 balls, so strike rate isn't a fair measure.");
    }
    if (sa.bowling && sb.bowling) {
      rows.push(
        { label: "Overs", a: sa.bowling.overs, b: sb.bowling.overs },
        { label: "Wickets", a: v(sa.bowling.wickets), b: v(sb.bowling.wickets), better: better(sa.bowling.wickets, sb.bowling.wickets) },
        { label: "Runs conceded", a: v(sa.bowling.runs), b: v(sb.bowling.runs), better: better(sa.bowling.runs, sb.bowling.runs, false) },
        { label: "Economy", a: v(sa.bowling.economy), b: v(sb.bowling.economy), better: better(sa.bowling.economy, sb.bowling.economy, false), formula: "runs conceded ÷ overs" },
        { label: "Dot balls", a: v(sa.bowling.dots), b: v(sb.bowling.dots), better: better(sa.bowling.dots, sb.bowling.dots) },
      );
    }
    if (!rows.length)
      return {
        ok: false,
        reason: "One batted and the other bowled (or didn't play): there are no shared numbers to compare fairly.",
      };
    if (!(sa.batting && sb.batting)) caveats.push("Only bowling is compared: they didn't both bat.");
    if (!(sa.bowling && sb.bowling)) caveats.push("Only batting is compared: they didn't both bowl.");
    return { ok: true, rows, caveats };
  }
  return { ok: false, reason: "These statistics can't be compared." };
}
