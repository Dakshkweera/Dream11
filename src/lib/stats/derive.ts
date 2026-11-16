/**
 * Numbers calculated from stored statistics, with the formula for each. Never stored, always derived, so a
 * calculated value can't drift from its inputs. Safe to import on the client.
 */
import type { BasketballPlayerStats, CricketBatting, CricketBowling, PlayerMatchStats } from "./schema";

const pct = (made: number | null, att: number | null) => (made === null || att === null || att === 0 ? null : Math.round((made / att) * 1000) / 10);

/** Basketball shooting percentages, 1 decimal place, or null when there were no attempts (or no data). */
export function shooting(s: BasketballPlayerStats) {
  return {
    /** FG% = field goals made ÷ attempted × 100 */
    fgPct: pct(s.fgMade, s.fgAttempted),
    /** 3P% = three-pointers made ÷ attempted × 100 */
    threePct: pct(s.threeMade, s.threeAttempted),
    /** FT% = free throws made ÷ attempted × 100 */
    ftPct: pct(s.ftMade, s.ftAttempted),
    /** Two-point field goals = all field goals − three-pointers */
    twoMade: s.fgMade === null || s.threeMade === null ? null : s.fgMade - s.threeMade,
    twoAttempted: s.fgAttempted === null || s.threeAttempted === null ? null : s.fgAttempted - s.threeAttempted,
  };
}

/** "8/12" or "—" when missing. */
export const madeOf = (made: number | null, att: number | null) => (made === null || att === null ? "—" : `${made}/${att}`);
/** Show a number, or "—" when the source doesn't have it. */
export const show = (v: number | string | null | undefined) => (v === null || v === undefined ? "—" : String(v));

/** One-line summary of a player's match, using only stored and derived numbers. */
export function lineOf(r: PlayerMatchStats): string {
  const s = r.stats;
  if (s.sport === "basketball") {
    if (s.points === null) return s.note ?? "No statistics";
    const sh = shooting(s);
    return [
      `${s.points} pts, ${show(s.rebounds)} reb, ${show(s.assists)} ast`,
      `${madeOf(s.fgMade, s.fgAttempted)} FG${sh.fgPct !== null ? ` (${sh.fgPct}%)` : ""}`,
      `${madeOf(s.threeMade, s.threeAttempted)} 3PT`,
      `${show(s.minutes)} min`,
    ].join(" · ");
  }
  const parts: string[] = [];
  if (s.batting) parts.push(battingLine(s.batting));
  if (s.bowling) parts.push(bowlingLine(s.bowling));
  if (!parts.length) return s.didNotBat ? "Did not bat or bowl" : "No statistics";
  return parts.join(" · ");
}

export function battingLine(b: CricketBatting): string {
  const how = b.notOut ? "not out" : b.dismissal ? dismissalText(b.dismissal) : "out";
  return `${b.runs}${b.notOut ? "*" : ""} off ${b.balls} (${b.fours}×4, ${b.sixes}×6, SR ${show(b.strikeRate)}), ${how}`;
}

export function bowlingLine(w: CricketBowling): string {
  return `${w.overs}-${w.maidens}-${w.runs}-${w.wickets} (econ ${show(w.economy)})`;
}

export function dismissalText(d: NonNullable<CricketBatting["dismissal"]>): string {
  const f = d.fielders.join("/");
  switch (d.kind) {
    case "caught":
      return `c ${f} b ${d.bowler}`;
    case "caught and bowled":
      return `c & b ${d.bowler}`;
    case "bowled":
      return `b ${d.bowler}`;
    case "lbw":
      return `lbw b ${d.bowler}`;
    case "stumped":
      return `st ${f} b ${d.bowler}`;
    case "run out":
      return `run out${f ? ` (${f})` : ""}`;
    default:
      return d.kind + (d.bowler ? ` b ${d.bowler}` : "");
  }
}

/** How to label where numbers came from, for every screen and for Buzzer. */
export function provenance(r: Pick<PlayerMatchStats, "classification" | "verification" | "source">): string {
  const when = r.classification === "historical" ? "Historical" : r.classification === "demo" ? "Demo data" : "Live";
  const check =
    r.verification === "source-imported"
      ? "imported from the source and totals checked"
      : r.verification === "hand-verified"
        ? "checked by hand"
        : "entered from the source, awaiting a human check";
  return `${when} · ${r.source} · ${check}`;
}
