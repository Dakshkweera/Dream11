"use client";

import { useEffect, useState } from "react";
import type { MatchStats, PlayerMatchStats, Portrait } from "@/lib/stats/schema";

export type MatchStatsState =
  | { status: "loading" }
  | { status: "none" } // this match has no statistics
  | { status: "error"; message: string }
  | { status: "ready"; stats: MatchStats; portraits: Record<string, Portrait> };

/** The scorecard / box score for a match, from /api/stats. */
export function useMatchStats(matchId: string): MatchStatsState {
  const [state, setState] = useState<MatchStatsState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stats?match=${encodeURIComponent(matchId)}`)
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) throw new Error(`Couldn't load the statistics (${r.status}).`);
        const d = (await r.json()) as { stats: MatchStats | null; portraits: Record<string, Portrait> };
        if (cancelled) return;
        setState(d.stats ? { status: "ready", stats: d.stats, portraits: d.portraits } : { status: "none" });
      })
      .catch((e: Error) => !cancelled && setState({ status: "error", message: e.message || "Couldn't load the statistics." }));
    return () => {
      cancelled = true;
    };
  }, [matchId]);
  return state;
}

export type PlayerHistoryRecord = PlayerMatchStats & { match: { id: string; title: string; competition: string; date: string | null } | null };

/** Every match a player has statistics for. */
export function usePlayerHistory(playerId: string | null) {
  const [records, setRecords] = useState<PlayerHistoryRecord[] | null>(null);
  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    fetch(`/api/stats?player=${encodeURIComponent(playerId)}`)
      .then((r) => (r.ok ? r.json() : { records: [] }))
      .then((d: { records: PlayerHistoryRecord[] }) => !cancelled && setRecords(d.records))
      .catch(() => !cancelled && setRecords([]));
    return () => {
      cancelled = true;
    };
  }, [playerId]);
  return records;
}
