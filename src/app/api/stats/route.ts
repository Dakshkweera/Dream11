import { getMatch } from "@/lib/match/data";
import { matchStats, playerRecords, portraitOf, portraitsFor } from "@/lib/stats/data";

/**
 * Player statistics (public reference data, so no user lookup and no database round trip):
 *   GET /api/stats?match=<matchId>    the full scorecard / box score, with player photos
 *   GET /api/stats?player=<playerId>  every match this player has statistics for, with their photo
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const matchId = url.searchParams.get("match");
  const playerId = url.searchParams.get("player");

  if (matchId) {
    const stats = matchStats(matchId);
    // No statistics is a normal answer for most matches, not an error (a 404 would log a console error on every page).
    if (!stats) return Response.json({ stats: null, portraits: {} }, { headers: { "Cache-Control": "public, max-age=300" } });
    return Response.json(
      { stats, portraits: portraitsFor(stats.players.map((p) => p.playerId)) },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  }

  if (playerId) {
    const records = playerRecords(playerId).map((r) => {
      const m = getMatch(r.matchId);
      return { ...r, match: m ? { id: m.id, title: m.title, competition: m.competition ?? m.subtitle, date: m.date ?? null } : null };
    });
    return Response.json({ records, portrait: portraitOf(playerId) }, { headers: { "Cache-Control": "public, max-age=300" } });
  }

  return Response.json({ error: "Pass ?match=<id> or ?player=<id>" }, { status: 400 });
}
