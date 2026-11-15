/**
 * Fills a match in data/matches.json from a Cricsheet file: the XI for each side, the season,
 * and the ball-by-ball timeline aligned to your video with a few sync anchors.
 *
 *   npm run import-match -- <cricsheet.json> <matchId> --sync "15.1=12,16.1=290,19.6=540" [--innings 2]
 *
 * Get the file from https://cricsheet.org/downloads/ (ipl_json.zip) and unzip it.
 * Sync anchors say when a ball appears in the video: label=seconds, using cricket notation
 * (15.1 is the first ball of the 16th over). Give the first and last ball in your clip, plus any
 * in between you can find — more anchors means a more accurate scoreboard.
 */
import { loadEnvConfig } from "@next/env";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

loadEnvConfig(process.cwd());

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const [file, matchId] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
  const sync = arg("sync");
  if (!file || !matchId || !sync) {
    console.error('Usage: npm run import-match -- <cricsheet.json> <matchId> --sync "15.1=12,16.1=290" [--innings 2]');
    process.exit(1);
  }

  const { ballsOf, buildTimeline, parseSync, sameNameAs } = await import("../src/lib/match/cricsheet");
  const { allEntities, findEntity } = await import("../src/lib/facts/retrieve");
  type Cricsheet = import("../src/lib/match/cricsheet").CricsheetMatch;

  const cs = JSON.parse(readFileSync(file, "utf8")) as Cricsheet;
  const short = (team: string) => findEntity(team)?.aliases[0] ?? team;

  const path = join(process.cwd(), "data", "matches.json");
  const matches = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>[];
  const entry = matches.find((m) => m.id === matchId) as
    | { id: string; season: string; teams: string[]; squads: Record<string, unknown[]>; timeline: unknown[] }
    | undefined;
  if (!entry) {
    console.error(`No match "${matchId}" in data/matches.json. Ids: ${matches.map((m) => m.id).join(", ")}`);
    process.exit(1);
  }

  // Timeline
  const inningsIndex = Number(arg("innings") ?? 2) - 1;
  const balls = ballsOf(cs, inningsIndex, short);
  const timeline = buildTimeline(balls, parseSync(sync));
  entry.timeline = timeline;

  // Season
  entry.season = String(cs.info.season ?? entry.season);

  // Squads: the real XI from the file, linked to dataset players where the names match.
  const players = allEntities().filter((e) => e.type === "player");
  const batted = new Set(cs.innings.flatMap((i) => i.overs.flatMap((o) => o.deliveries.map((d) => d.batter))));
  const bowled = new Set(cs.innings.flatMap((i) => i.overs.flatMap((o) => o.deliveries.map((d) => d.bowler))));
  const squads: Record<string, unknown[]> = {};
  let linked = 0;
  for (const [teamName, names] of Object.entries(cs.info.players ?? {})) {
    const teamEntity = findEntity(teamName);
    if (!teamEntity) {
      console.warn(`! Team "${teamName}" is not in the dataset — skipped`);
      continue;
    }
    squads[teamEntity.id] = names.map((n) => {
      const hit = players.find((p) => sameNameAs(n, p.name));
      if (hit) linked++;
      // Cricsheet has no roles; this is a rough guess from what they did in the match.
      const role = batted.has(n) && bowled.has(n) ? "AR" : bowled.has(n) ? "BOWL" : "BAT";
      return { name: hit?.name ?? n, role, ...(hit ? { entityId: hit.id } : {}) };
    });
  }
  if (Object.keys(squads).length) entry.squads = squads;

  writeFileSync(path, JSON.stringify(matches, null, 2) + "\n");
  console.log(`✓ ${matchId}: season ${entry.season}, ${timeline.length} balls on the timeline`);
  console.log(`  first: ${JSON.stringify(timeline[0])}`);
  console.log(`  last:  ${JSON.stringify(timeline.at(-1))}`);
  console.log(`  squads: ${Object.values(squads).flat().length} players, ${linked} linked to dataset facts`);
  console.log("  Roles are guessed from the match (Cricsheet has none) — fix any in data/matches.json.");
}

main().catch((e: Error) => {
  console.error("✗", e.message);
  process.exit(1);
});
