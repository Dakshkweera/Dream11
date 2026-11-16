import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getEntity } from "@/lib/facts/retrieve";
import { shortName, teamIdentity } from "@/lib/ui/identity";
import type { Match, MatchResult } from "./data";

/** What a match card and the match header need, computed on the server from data/matches.json. */
export type MatchSummary = {
  id: string;
  title: string;
  sport: string;
  status: Match["status"];
  competition: string;
  date: string | null;
  venue: string | null;
  teams: [TeamSide, TeamSide];
  result: MatchResult | null;
  /** The clip is actually there, so the watch-along can play. */
  hasClip: boolean;
  /** The clip's URL, only when it is there. */
  video: string | null;
};
export type TeamSide = { id: string; code: string; name: string; short: string; primary: string; secondary: string };

/** Only call it a watch-along when the clip is actually there; otherwise it's just a match page. */
export function clipExists(video: string | null): boolean {
  if (!video) return false;
  if (/^https?:\/\//.test(video)) return true;
  return fs.existsSync(path.join(process.cwd(), "public", video));
}

export function summarize(m: Match): MatchSummary {
  const side = (id: string): TeamSide => {
    const t = teamIdentity(id);
    return { id, code: t.code, name: getEntity(id)?.name ?? id, short: shortName(id), primary: t.primary, secondary: t.secondary };
  };
  return {
    id: m.id,
    title: m.title,
    sport: m.sport,
    status: m.status,
    competition: m.competition ?? m.subtitle.replace(/\s*·\s*Watch-along$/i, ""),
    date: m.date ?? null,
    venue: m.venue ? (getEntity(m.venue)?.name ?? null) : null,
    teams: [side(m.teams[0]), side(m.teams[1])],
    result: m.result ?? null,
    hasClip: clipExists(m.video),
    video: clipExists(m.video) ? m.video : null,
  };
}
