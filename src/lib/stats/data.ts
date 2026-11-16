/**
 * The statistics data layer: every match's player statistics and every player photo, validated on load.
 * Public reference data (no secrets), so it can be read by API routes, the chat service and scripts alike.
 * Add a new data/stats/<matchId>.json here after importing it.
 */
import { z } from "zod";
import portraitsJson from "../../../data/portraits.json";
import rcbVsGt from "../../../data/stats/rcb-vs-gt.json";
import rcbVsPbks from "../../../data/stats/rcb-vs-pbks.json";
import usaVsFra from "../../../data/stats/usa-vs-fra.json";
import { MatchStats, Portrait, type PlayerMatchStats } from "./schema";

const matches = new Map(z.array(MatchStats).parse([rcbVsPbks, rcbVsGt, usaVsFra]).map((m) => [m.matchId, m]));
const portraits = new Map(z.array(Portrait).parse(portraitsJson).map((p) => [p.playerId, p]));

export function matchStats(matchId: string) {
  return matches.get(matchId) ?? null;
}

export function matchesWithStats(): string[] {
  return [...matches.keys()];
}

/** Every match this player has statistics for, oldest first by data order. */
export function playerRecords(playerId: string): PlayerMatchStats[] {
  return [...matches.values()].flatMap((m) => m.players.filter((p) => p.playerId === playerId));
}

export function playerRecord(matchId: string, playerId: string): PlayerMatchStats | null {
  return matches.get(matchId)?.players.find((p) => p.playerId === playerId) ?? null;
}

/** Find a player in the stats by id or by name ("Kohli", "V Kohli", "Stephen Curry"). */
export function findStatsPlayer(nameOrId: string, matchId?: string): PlayerMatchStats | null {
  const q = nameOrId.trim().toLowerCase();
  const pool = matchId ? (matches.get(matchId)?.players ?? []) : [...matches.values()].flatMap((m) => m.players);
  return (
    pool.find((p) => p.playerId === nameOrId) ??
    pool.find((p) => p.name.toLowerCase() === q) ??
    pool.find((p) => p.name.toLowerCase().split(/\s+/).pop() === q.split(/\s+/).pop() && q.length >= 4) ??
    null
  );
}

export function portraitOf(playerId: string) {
  return portraits.get(playerId) ?? null;
}

/** Photos for a set of players (only those that have one). */
export function portraitsFor(playerIds: string[]) {
  return Object.fromEntries(playerIds.map((id) => [id, portraits.get(id)]).filter(([, p]) => !!p));
}
