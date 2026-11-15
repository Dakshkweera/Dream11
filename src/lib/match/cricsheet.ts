/**
 * Cricsheet ball-by-ball JSON → the watch-along's timeline.
 * Cricsheet supplies the facts (every delivery); a few hand-set "sync anchors"
 * say when specific balls appear in the video, and the rest are interpolated.
 * https://cricsheet.org/format/json/
 */
import type { TimelineBall } from "./data";

type Delivery = {
  batter: string;
  bowler: string;
  runs: { batter: number; extras: number; total: number };
  extras?: Record<string, number>;
  wickets?: { player_out: string; kind: string }[];
};

export type CricsheetMatch = {
  info: {
    teams: string[];
    season?: string | number;
    dates?: string[];
    venue?: string;
    players?: Record<string, string[]>;
  };
  innings: { team: string; overs: { over: number; deliveries: Delivery[] }[] }[];
};

export type Ball = Omit<TimelineBall, "t"> & { label: string; legal: boolean };
export type Anchor = { label: string; t: number };

/** Every delivery of one innings, with running score and a readable event. */
export function ballsOf(match: CricsheetMatch, inningsIndex: number, shortName: (team: string) => string): Ball[] {
  const inn = match.innings[inningsIndex];
  if (!inn) throw new Error(`No innings ${inningsIndex + 1} in this match (it has ${match.innings.length}).`);
  const out: Ball[] = [];
  let runs = 0;
  let wickets = 0;
  for (const over of inn.overs) {
    let legalInOver = 0;
    for (const d of over.deliveries) {
      const legal = !d.extras?.wides && !d.extras?.noballs;
      if (legal) legalInOver++;
      runs += d.runs.total;
      if (d.wickets?.length) wickets += d.wickets.length;
      // An illegal delivery shares the label of the legal ball that follows it (cricket convention).
      const label = `${over.over}.${legal ? legalInOver : legalInOver + 1}`;
      out.push({
        label,
        legal,
        over: label,
        battingTeam: shortName(inn.team),
        score: `${runs}/${wickets}`,
        batter: d.batter,
        bowler: d.bowler,
        event: describe(d),
      });
    }
  }
  return out;
}

function describe(d: Delivery): string {
  if (d.wickets?.length) {
    const w = d.wickets[0];
    return `WICKET — ${w.kind}${w.player_out !== d.batter ? ` (${w.player_out})` : ""}`;
  }
  if (d.extras?.wides) return `WIDE${d.runs.total > 1 ? ` +${d.runs.total - 1}` : ""}`;
  if (d.extras?.noballs) return `NO BALL${d.runs.total > 1 ? ` +${d.runs.total - 1}` : ""}`;
  if (d.runs.batter === 6) return "SIX";
  if (d.runs.batter === 4) return "FOUR";
  if (d.runs.total === 0) return "DOT";
  return `${d.runs.total} RUN${d.runs.total === 1 ? "" : "S"}`;
}

/** "15.1=12, 16.1=290" → anchors. Labels use cricket notation: 15.1 is the first ball of the 16th over. */
export function parseSync(input: string): Anchor[] {
  const anchors = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const m = pair.match(/^(\d+\.\d+)\s*=\s*(\d+(?:\.\d+)?)$/);
      if (!m) throw new Error(`Bad sync "${pair}". Use label=seconds, e.g. 15.1=12`);
      return { label: m[1], t: Number(m[2]) };
    });
  if (anchors.length < 2) throw new Error("Give at least 2 sync anchors (the first and last ball in your clip).");
  return anchors;
}

/**
 * Place deliveries on the video's clock. Between two anchors, balls are spread evenly;
 * balls outside the first/last anchor are not included. Throws on unknown labels or backwards time.
 */
export function buildTimeline(balls: Ball[], anchors: Anchor[]): TimelineBall[] {
  const located = anchors.map((a) => {
    // The legal ball is the last delivery carrying this label.
    let idx = -1;
    balls.forEach((b, i) => b.label === a.label && (idx = i));
    if (idx < 0) throw new Error(`Ball ${a.label} not found in this innings.`);
    return { idx, t: a.t, label: a.label };
  });
  located.sort((a, b) => a.idx - b.idx);
  for (let i = 1; i < located.length; i++) {
    if (located[i].idx === located[i - 1].idx) throw new Error(`Anchors ${located[i - 1].label} and ${located[i].label} are the same ball.`);
    if (located[i].t <= located[i - 1].t) throw new Error(`Video time must increase: ${located[i - 1].label}=${located[i - 1].t} then ${located[i].label}=${located[i].t}.`);
  }

  const out: TimelineBall[] = [];
  for (let k = 0; k < located.length - 1; k++) {
    const a = located[k];
    const b = located[k + 1];
    for (let i = a.idx; i < b.idx || (k === located.length - 2 && i === b.idx); i++) {
      const frac = (i - a.idx) / (b.idx - a.idx);
      const { label: _label, legal: _legal, ...ball } = balls[i];
      void _label;
      void _legal;
      out.push({ t: Math.round(a.t + (b.t - a.t) * frac), ...ball });
    }
  }
  return out;
}

/**
 * Match a Cricsheet name ("V Kohli", "RA Jadeja") to a dataset player name ("Virat Kohli").
 * Requires the same surname and a matching first initial.
 */
export function sameNameAs(cricsheetName: string, fullName: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").trim();
  const a = norm(cricsheetName).split(/\s+/);
  const b = norm(fullName).split(/\s+/);
  if (norm(cricsheetName) === norm(fullName)) return true;
  return a[a.length - 1] === b[b.length - 1] && a[0][0] === b[0][0];
}
