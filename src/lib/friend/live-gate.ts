/**
 * A cheap, code-only check that runs before the AI is asked whether to comment on the match.
 * Most commentary chunks are filler ("good length, nothing happening"), and calling the main model
 * on each one every ~10 seconds would be slow and costly. Only chunks that could matter go through.
 *
 * It is sport-aware: each sport has its own list of big moments, and the jargon a casual fan might not know
 * comes from the data (the concept topics of that sport), so a new sport needs data, not new code.
 */
import { conceptEntities } from "../facts/concepts";
import type { Entity } from "../facts/schema";

const BIG_EVENTS: Record<string, RegExp> = {
  cricket:
    /\b(wicket|bowled|caught|lbw|run[- ]out|stumped|stumping|six|sixer|four|boundary|century|hundred|fifty|half[- ]century|dropped|no[- ]ball|free[- ]hit|super[- ]over|last (?:ball|over)|final over|hat[- ]trick)\b/i,
  basketball:
    /\b(dunk|three-pointers?|three|3-pointers?|buzzer|steal|block|rejection|alley-oop|and-one|technical foul|ejected|overtime|comeback|clutch|gold medal|medal|timeout)\b/i,
};
/** Moments worth a comment in any sport. */
const ANY_SPORT_EVENT = /\b(winner|champions?|record|upset|overtime|final)\b/i;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A word-boundary pattern matching a concept's name or any of its aliases. */
function conceptPattern(e: Entity): RegExp {
  const names = [e.name, ...e.aliases].filter((n) => n.length >= 3).map(escapeRegExp);
  return new RegExp(`\\b(?:${names.join("|")})\\b`, "i");
}

export type GateInput = {
  transcript: string;
  /** entity ids the fan cares about (interests and fantasy picks) */
  interests: Set<string>;
  /** concept topic ids the fan has already learned */
  learned: Set<string>;
  /** entity ids named in the transcript */
  mentioned: string[];
  sport?: string;
};

export type GateResult = { speak: boolean; reason: string };

export function shouldComment({ transcript, interests, learned, mentioned, sport = "cricket" }: GateInput): GateResult {
  if (!transcript.trim()) return { speak: false, reason: "nothing heard" };

  const theirs = mentioned.filter((id) => interests.has(id));
  if (theirs.length) return { speak: true, reason: "a player or team the fan cares about is involved" };

  const term = conceptEntities(sport).find((c) => !learned.has(c.id) && conceptPattern(c).test(transcript));
  if (term) return { speak: true, reason: `the commentators used a term the fan may not know (${term.name.toLowerCase()})` };

  const events = BIG_EVENTS[sport] ?? ANY_SPORT_EVENT;
  if (mentioned.length > 0 && events.test(transcript)) return { speak: true, reason: "a big moment involving named players" };

  return { speak: false, reason: "nothing relevant to this fan" };
}
