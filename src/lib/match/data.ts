import { z } from "zod";
import matchesJson from "../../../data/matches.json";

const SquadPlayer = z.object({
  name: z.string(),
  entityId: z.string().optional(),
  /** Cricket: BAT/BOWL/AR/WK. Other sports may leave it out. */
  role: z.string().optional(),
});

/** One delivery in the clip, aligned to the video timestamp (seconds). */
export const TimelineBall = z.object({
  t: z.number(),
  over: z.string(), // "18.3"
  battingTeam: z.string(),
  score: z.string(), // "164/5"
  batter: z.string(),
  bowler: z.string(),
  event: z.string(), // "FOUR", "WICKET — caught", "1 run"
});

export const Match = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  sport: z.string().default("cricket"),
  status: z.enum(["replay", "upcoming", "live"]),
  season: z.string(),
  venue: z.string().nullable(),
  teams: z.tuple([z.string(), z.string()]),
  video: z.string().nullable(),
  squads: z.record(z.string(), z.array(SquadPlayer)),
  timeline: z.array(TimelineBall),
});

export type Match = z.infer<typeof Match>;
export type TimelineBall = z.infer<typeof TimelineBall>;

const matches = z.array(Match).parse(matchesJson);

export function allMatches(): Match[] {
  return matches;
}

export function getMatch(id: string): Match | undefined {
  return matches.find((m) => m.id === id);
}

/** Every known entity on a match page: teams, venue and squad players with entity ids. */
export function matchEntities(m: Match): string[] {
  const players = Object.values(m.squads)
    .flat()
    .map((p) => p.entityId)
    .filter((x): x is string => !!x);
  return [...m.teams, ...players, ...(m.venue ? [m.venue] : [])];
}

/** Squad names for biasing transcription toward correct spellings. */
export function squadNames(m: Match): string[] {
  return Object.values(m.squads)
    .flat()
    .map((p) => p.name);
}

/** The latest ball at or before video time `t`. */
export function ballAt(m: Match, t: number): TimelineBall | null {
  let last: TimelineBall | null = null;
  for (const b of m.timeline) if (b.t <= t) last = b;
  return last;
}
