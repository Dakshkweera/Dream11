/**
 * Builds a full batting and bowling scorecard from a Cricsheet file and writes data/stats/<matchId>.json.
 *
 *   npm run import-scorecard -- data/sources/cricsheet/1473511.json rcb-vs-pbks
 *
 * The numbers are counted from the source deliveries (see src/lib/stats/cricket.ts for every formula), then
 * checked: batters + extras and bowlers + byes/leg byes must both equal the innings total, wickets must match
 * the dismissals, and the result must agree with the match in data/matches.json. Any mismatch stops the import.
 */
import { loadEnvConfig } from "@next/env";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

loadEnvConfig(process.cwd());

async function main() {
  const [file, matchId] = process.argv.slice(2);
  if (!file || !matchId) {
    console.error("Usage: npm run import-scorecard -- <cricsheet.json> <matchId>");
    process.exit(1);
  }
  const { scorecardFromCricsheet, validateScorecard } = await import("../src/lib/stats/cricket");
  const { MatchStats } = await import("../src/lib/stats/schema");
  const { sameNameAs } = await import("../src/lib/match/cricsheet");
  const { allEntities, findEntity } = await import("../src/lib/facts/retrieve");
  const { getMatch } = await import("../src/lib/match/data");
  type File = import("../src/lib/stats/cricket").CricsheetFile;

  const match = getMatch(matchId);
  if (!match) throw new Error(`No match "${matchId}" in data/matches.json`);
  if (match.sport !== "cricket") throw new Error(`${matchId} is a ${match.sport} match`);

  const cs = JSON.parse(readFileSync(file, "utf8")) as File;
  const players = allEntities().filter((e) => e.type === "player" && e.sport === "cricket");

  const teamIdOf = (team: string) => {
    const e = findEntity(team);
    if (!e || e.type !== "team") throw new Error(`Team "${team}" is not in data/entities.json`);
    if (!match.teams.includes(e.id)) throw new Error(`Team "${team}" (${e.id}) is not in match ${matchId}`);
    return e.id;
  };
  const playerOf = (name: string, registryId: string | undefined) => {
    const hit = players.find((p) => sameNameAs(name, p.name));
    if (hit) return { id: hit.id, name: hit.name };
    if (!registryId) throw new Error(`No Cricsheet registry id for "${name}"`);
    return { id: `cricsheet:${registryId}`, name };
  };

  const today = new Date().toISOString().slice(0, 10);
  const ms = scorecardFromCricsheet(cs, {
    matchId,
    teamIdOf,
    playerOf,
    source: {
      name: "Cricsheet",
      url: "https://cricsheet.org/",
      license: "Open Data Commons Attribution License (ODC-By 1.0)",
      attribution: "Data: Cricsheet (cricsheet.org)",
      retrievedAt: today,
    },
    sourceUrl: "https://cricsheet.org/downloads/ipl_json.zip",
  });
  ms.notes = [
    `Counted ball by ball from Cricsheet file ${basename(file)} (in the IPL archive ipl_json.zip).`,
    "Player names are Cricsheet's (initials + surname) unless the player is in Buzzer's dataset.",
    "Cricsheet does not record minutes batted, so they are not shown.",
  ];

  // 1. The scorecard adds up against the source deliveries.
  const problems = validateScorecard(cs, ms);
  // 2. The result agrees with what the app already says about this match.
  const scores = match.result?.scores ?? {};
  for (const inn of ms.cricket!.innings) {
    const shown = scores[inn.teamId];
    if (shown && !shown.startsWith(`${inn.runs}/${inn.wickets}`) && shown !== `${inn.runs}`)
      problems.push(`${inn.teamId}: data/matches.json shows "${shown}" but Cricsheet gives ${inn.runs}/${inn.wickets}`);
  }
  if (problems.length) {
    console.error(`✗ ${matchId}: the scorecard does not add up, nothing written:\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }
  MatchStats.parse(ms);

  const out = join(process.cwd(), "data", "stats", `${matchId}.json`);
  writeFileSync(out, JSON.stringify(ms, null, 2) + "\n");
  for (const inn of ms.cricket!.innings) {
    console.log(`  innings ${inn.number}: ${inn.teamId} ${inn.runs}/${inn.wickets} (${inn.overs} ov), extras ${inn.extras.total}`);
  }
  const linked = ms.players.filter((p) => p.playerId.startsWith("player:")).length;
  console.log(`✓ ${matchId}: ${ms.players.length} players (${linked} linked to the dataset) → data/stats/${matchId}.json`);
  console.log("  Remember: register new files in src/lib/stats/data.ts.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
