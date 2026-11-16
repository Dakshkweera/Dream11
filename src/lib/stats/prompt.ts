/**
 * Turns structured statistics into the STATS block Buzzer reads. Buzzer only ever reads these numbers; the
 * records come from importers and hand entry, never from the AI.
 */
import { getEntity } from "../facts/retrieve";
import { getMatch } from "../match/data";
import { matchStats, matchesWithStats, playerRecords } from "./data";
import { battingLine, bowlingLine, lineOf, provenance, shooting, show } from "./derive";
import type { MatchStats, PlayerMatchStats } from "./schema";

/** How Buzzer must treat the STATS block. Added to the chat prompt whenever statistics are included. */
export const STATS_RULES = `STATS RULES (these numbers are exact records from the data layer):
- Quote STATS numbers exactly as written. Never estimate, round differently, recalculate or invent a number, a match or a record.
- Keep facts and opinion apart: first what the numbers say, then your read of why, flagged as your read ("my guess is", "probably because"). Never present a guess as a fact.
- Only compare with matches that appear in STATS. If they ask about a match, season or career number that isn't there, say plainly that you don't have it.
- These are historical numbers from finished matches, not live. If a line says "awaiting a human check", mention that if they ask how reliable it is.
- Explain any statistic in plain words at the fan's level (for example strike rate = runs per 100 balls; economy = runs given per over; FG% = share of shots that went in).
- If they ask about a player who isn't in STATS, say you don't have that player's numbers for this match.`;

const teamCode = (id: string) => getEntity(id)?.aliases[0] ?? getEntity(id)?.name ?? id;
const matchLabel = (id: string) => {
  const m = getMatch(id);
  return m ? `${m.competition ?? m.title} (${m.date ?? m.season})` : id;
};

function cricketCard(ms: MatchStats): string[] {
  const byId = new Map(ms.players.map((p) => [p.playerId, p]));
  const out: string[] = [];
  for (const inn of ms.cricket?.innings ?? []) {
    const e = inn.extras;
    out.push(
      `Innings ${inn.number}: ${teamCode(inn.teamId)} ${inn.runs}/${inn.wickets} in ${inn.overs} overs` +
        `${inn.target ? ` (target ${inn.target})` : ""}; extras ${e.total} (wides ${e.wides}, no-balls ${e.noballs}, byes ${e.byes}, leg byes ${e.legbyes})`,
    );
    const bat = inn.battingOrder.map((id) => byId.get(id)).filter((p): p is PlayerMatchStats => !!p);
    out.push(
      `  Batting: ${bat
        .map((p) => (p.stats.sport === "cricket" && p.stats.batting ? `${p.name} ${battingLine(p.stats.batting)}` : ""))
        .filter(Boolean)
        .join("; ")}`,
    );
    if (inn.didNotBat.length) out.push(`  Did not bat: ${inn.didNotBat.map((id) => byId.get(id)?.name ?? id).join(", ")}`);
    const bowl = inn.bowlingOrder.map((id) => byId.get(id)).filter((p): p is PlayerMatchStats => !!p);
    out.push(
      `  Bowling (O-M-R-W): ${bowl
        .map((p) => (p.stats.sport === "cricket" && p.stats.bowling ? `${p.name} ${bowlingLine(p.stats.bowling)}, ${p.stats.bowling.dots} dots` : ""))
        .filter(Boolean)
        .join("; ")}`,
    );
  }
  return out;
}

function basketballBox(ms: MatchStats): string[] {
  const byId = new Map(ms.players.map((p) => [p.playerId, p]));
  const out: string[] = [];
  for (const t of ms.basketball?.teams ?? []) {
    out.push(`${teamCode(t.teamId)} ${t.points} points:`);
    for (const id of t.playerOrder) {
      const p = byId.get(id);
      if (!p || p.stats.sport !== "basketball") continue;
      const s = p.stats;
      if (s.points === null) {
        out.push(`  ${p.name}: ${s.note ?? "no statistics"}`);
        continue;
      }
      const sh = shooting(s);
      out.push(
        `  ${p.name}${s.starter ? " (starter)" : ""}: ${s.minutes} min, ${s.points} pts, ${s.rebounds} reb (${s.offensiveRebounds} off), ${s.assists} ast, ` +
          `${s.steals} stl, ${s.blocks} blk, ${s.turnovers} TO, ${s.fouls} fouls, FG ${s.fgMade}/${s.fgAttempted} (${show(sh.fgPct)}%), ` +
          `3PT ${s.threeMade}/${s.threeAttempted} (${show(sh.threePct)}%), FT ${s.ftMade}/${s.ftAttempted}, +/- ${show(s.plusMinus)}`,
      );
    }
  }
  return out;
}

/** The full scorecard or box score for one match. */
export function matchStatsPrompt(matchId: string): string | null {
  const ms = matchStats(matchId);
  if (!ms) return null;
  const head = `Match: ${matchLabel(matchId)}. ${provenance({ classification: ms.classification, verification: ms.verification, source: ms.source.name })}.`;
  return [head, ...(ms.sport === "cricket" ? cricketCard(ms) : basketballBox(ms))].join("\n");
}

/** Every match a player has statistics for, so Buzzer can compare with their other matches (only these). */
export function playerHistoryPrompt(playerId: string): string | null {
  const recs = playerRecords(playerId);
  if (!recs.length) return null;
  return `${recs[0].name}, every match with statistics (${recs.length}):\n${recs.map((r) => `  - ${matchLabel(r.matchId)}: ${lineOf(r)}`).join("\n")}`;
}

/** Surnames that are also everyday words: only the full name counts for these. */
const COMMON_WORDS = new Set(["white", "holiday", "salt", "young", "green", "king", "rose", "may", "short", "hope", "head", "wood"]);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Players in the statistics whose name appears in the text ("Kohli", "Wembanyama", "Phil Salt"). */
export function statsPlayersMentioned(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const hits = new Set<string>();
  for (const id of matchesWithStats()) {
    for (const p of matchStats(id)!.players) {
      const parts = p.name.toLowerCase().split(/\s+/);
      const surname = parts[parts.length - 1];
      const full = new RegExp(`\\b${escape(p.name.toLowerCase())}\\b`).test(lower);
      const bySurname = surname.length >= 4 && !COMMON_WORDS.has(surname) && new RegExp(`\\b${escape(surname)}\\b`).test(lower);
      if (full || bySurname) hits.add(p.playerId);
    }
  }
  return [...hits];
}

/**
 * The STATS block for a chat turn: the match on screen (full card), plus the history of any player in focus
 * or named in the message. Empty when nothing relevant has statistics.
 */
export function statsForChat(opts: { matchId?: string; playerIds: string[]; message: string }): string {
  const parts: string[] = [];
  const matchId = opts.matchId && matchStats(opts.matchId) ? opts.matchId : undefined;
  if (matchId) parts.push(matchStatsPrompt(matchId)!);
  const players = [...new Set([...opts.playerIds, ...statsPlayersMentioned(opts.message)])].slice(0, 4);
  for (const id of players) {
    const h = playerHistoryPrompt(id);
    if (h) parts.push(h);
  }
  if (!parts.length) return "";
  return `STATS:\n${parts.join("\n\n")}\n\n${STATS_RULES}`;
}
