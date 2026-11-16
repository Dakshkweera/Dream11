// FIBA official box score, Men's Olympic Basketball Tournament Paris 2024, Final, France 87–98 USA (game 122608),
// copied row by row from https://www.fiba.basketball/en/events/mens-olympic-basketball-tournament-paris-2024/games/122608-FRA-USA#boxscore
// Columns: # | PLAYER (* = starter) | MIN | PTS | FG | 2PT | 3PT | FT | OREB | DREB | REB | AST | PF | TO | STL | BLK | +/- | EFF
// FIBA prints 0 as "-".
// Re-run: node scripts/enter-fiba-boxscore.mjs data/stats/usa-vs-fra.json  (stops if anything does not add up)
import fs from "node:fs";
const rows = {
  "team:france-basketball": [
    "1 | Frank Ntilikina * PG | 07:02 | 0 | 0/3 | 0/1 | 0/2 | 0/0 | - | 1 | 1 | 1 | 1 | 1 | - | - | -5",
    "5 | Nicolas Batum * SF | 25:01 | 5 | 2/3 | 1/1 | 1/2 | 0/0 | 4 | 4 | 8 | 4 | 1 | 1 | 1 | - | -20",
    "6 | Andrew Albicy PG | 03:03 | 0 | 0/0 | 0/0 | 0/0 | 0/0 | - | - | - | 1 | - | - | - | - | -6",
    "7 | Guerschon Yabusele * PF | 31:00 | 20 | 6/14 | 5/10 | 1/4 | 7/10 | 1 | 1 | 2 | - | 2 | 1 | 2 | - | -6",
    "8 | Isaia Cordinier * SG | 16:12 | 0 | 0/5 | 0/3 | 0/2 | 0/2 | - | - | - | 1 | 3 | 2 | 1 | - | -2",
    "10 | Evan Fournier SG | 18:42 | 8 | 3/10 | 1/2 | 2/8 | 0/0 | 2 | 1 | 3 | 2 | 1 | 3 | 1 | - | -9",
    "12 | Nando De Colo SG | 18:28 | 12 | 5/7 | 4/5 | 1/2 | 1/1 | - | 2 | 2 | 3 | 2 | 2 | 2 | - | 2",
    "26 | Mathias Lessort C | 10:35 | 5 | 2/2 | 2/2 | 0/0 | 1/2 | 1 | 2 | 3 | 2 | 3 | 1 | - | - | -7",
    "27 | Rudy Gobert C | 12:28 | 2 | 1/1 | 1/1 | 0/0 | 0/0 | - | 3 | 3 | 1 | 2 | - | 2 | - | 3",
    "32 | Victor Wembanyama * PF | 29:32 | 26 | 11/19 | 8/11 | 3/8 | 1/2 | 4 | 3 | 7 | 2 | - | 2 | 1 | - | -8",
    "85 | Matthew Strazel PG | 06:34 | 3 | 1/2 | 0/0 | 1/2 | 0/0 | - | - | - | 3 | - | - | - | - | 0",
    "99 | Bilal Coulibaly SF | 21:23 | 6 | 3/5 | 3/5 | 0/0 | 0/0 | - | 1 | 1 | 1 | 1 | - | - | 1 | 3",
  ],
  "team:usa-basketball": [
    "4 | Stephen Curry * SG | 29:37 | 24 | 8/13 | 0/1 | 8/12 | 0/0 | - | 1 | 1 | 5 | - | 5 | 2 | - | 20",
    "5 | Anthony Edwards G | 09:33 | 8 | 3/7 | 1/4 | 2/3 | 0/0 | - | 1 | 1 | - | - | 1 | 1 | - | -5",
    "6 | LeBron James * G | 32:29 | 14 | 6/10 | 5/8 | 1/2 | 1/1 | - | 6 | 6 | 10 | 3 | 5 | 2 | 1 | 17",
    "7 | Kevin Durant * G | 31:02 | 15 | 5/12 | 2/3 | 3/9 | 2/2 | 1 | 3 | 4 | 4 | 1 | 2 | 1 | 1 | 7",
    "8 | Derrick White G | DNP",
    "9 | Tyrese Haliburton G | DNP",
    "10 | Jayson Tatum SF | 11:03 | 2 | 1/3 | 1/2 | 0/1 | 0/0 | 1 | 2 | 3 | - | 2 | - | 1 | - | -5",
    "11 | Joel Embiid * C | 11:07 | 4 | 0/1 | 0/1 | 0/0 | 4/4 | 1 | 2 | 3 | 2 | 1 | - | 1 | - | 2",
    "12 | Jrue Holiday G | 18:39 | 6 | 2/5 | 0/1 | 2/4 | 0/0 | - | 1 | 1 | 4 | 1 | 1 | - | - | -8",
    "13 | Bam Adebayo C | 09:02 | 2 | 1/1 | 1/1 | 0/0 | 0/0 | 1 | - | 1 | - | 2 | - | - | - | 7",
    "14 | Anthony Davis C | 19:51 | 8 | 4/5 | 4/5 | 0/0 | 0/0 | 6 | 3 | 9 | 1 | 2 | 2 | 2 | 4 | 2",
    "15 | Devin Booker * G | 27:37 | 15 | 6/10 | 4/5 | 2/5 | 1/1 | 1 | 5 | 6 | 3 | 4 | - | - | - | 18",
  ],
};
// Team/Coaches row (rebounds, fouls, turnovers not credited to a player) and the official TOTAL row.
const teamRows = {
  "team:france-basketball": { teamRebounds: 3, total: { points: 87, fg: "34/71", three: "9/30", ft: "10/17", oreb: 13, dreb: 20, reb: 32, ast: 21, pf: 16, to: 13, stl: 10, blk: 1 } },
  "team:usa-basketball": { teamRebounds: 2, total: { points: 98, fg: "36/67", three: "18/36", ft: "8/8", oreb: 11, dreb: 26, reb: 37, ast: 29, pf: 17, to: 17, stl: 10, blk: 6 } },
};
// Team/Coaches row extras that the TOTAL includes: France OREB 1 DREB 2; USA DREB 2, PF 1, TO 1.
const teamExtras = {
  "team:france-basketball": { oreb: 1, dreb: 2, pf: 0, to: 0 },
  "team:usa-basketball": { oreb: 0, dreb: 2, pf: 1, to: 1 },
};

const known = {
  "Stephen Curry": "player:stephen-curry", "LeBron James": "player:lebron-james", "Kevin Durant": "player:kevin-durant",
  "Anthony Davis": "player:anthony-davis", "Victor Wembanyama": "player:victor-wembanyama", "Nicolas Batum": "player:nicolas-batum",
  "Guerschon Yabusele": "player:guerschon-yabusele", "Rudy Gobert": "player:rudy-gobert",
};
const n = (s) => (s === "-" ? 0 : Number(s));
const pair = (s) => s.split("/").map(Number);
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[^a-z ]/g, "").trim().replace(/\s+/g, "-");

const SOURCE_URL = "https://www.fiba.basketball/en/events/mens-olympic-basketball-tournament-paris-2024/games/122608-FRA-USA#boxscore";
const players = [];
const teams = [];
const problems = [];
for (const [teamId, list] of Object.entries(rows)) {
  const order = [];
  for (const line of list) {
    const c = line.split("|").map((x) => x.trim());
    const nameRaw = c[1];
    const starter = nameRaw.includes("*");
    const name = nameRaw.replace("*", "").replace(/\s+(PG|SG|SF|PF|C|G|F)$/, "").trim();
    const id = known[name] ?? `fiba:${slug(name)}`;
    order.push(id);
    let stats;
    if (c[2] === "DNP") {
      stats = { sport: "basketball", starter: false, minutes: null, points: null, rebounds: null, offensiveRebounds: null, defensiveRebounds: null, assists: null, steals: null, blocks: null, turnovers: null, fouls: null, fgMade: null, fgAttempted: null, threeMade: null, threeAttempted: null, ftMade: null, ftAttempted: null, plusMinus: null, note: "Did not play" };
    } else {
      const [fgm, fga] = pair(c[4]);
      const [twom, twoa] = pair(c[5]);
      const [tpm, tpa] = pair(c[6]);
      const [ftm, fta] = pair(c[7]);
      stats = {
        sport: "basketball", starter, minutes: c[2], points: n(c[3]),
        offensiveRebounds: n(c[8]), defensiveRebounds: n(c[9]), rebounds: n(c[10]), assists: n(c[11]), fouls: n(c[12]),
        turnovers: n(c[13]), steals: n(c[14]), blocks: n(c[15]), plusMinus: Number(c[16]),
        fgMade: fgm, fgAttempted: fga, threeMade: tpm, threeAttempted: tpa, ftMade: ftm, ftAttempted: fta,
      };
      // Each row must agree with itself.
      if (twom + tpm !== fgm || twoa + tpa !== fga) problems.push(`${name}: 2PT + 3PT ≠ FG`);
      if (2 * twom + 3 * tpm + ftm !== stats.points) problems.push(`${name}: points ${stats.points} ≠ 2×${twom} + 3×${tpm} + ${ftm}`);
      if (stats.offensiveRebounds + stats.defensiveRebounds !== stats.rebounds) problems.push(`${name}: OREB + DREB ≠ REB`);
    }
    players.push({
      playerId: id, name, matchId: "usa-vs-fra", teamId, sport: "basketball", stats,
      source: "FIBA official box score", sourceUrl: SOURCE_URL, verification: "hand-entered", classification: "historical",
    });
  }
  // Columns must add up to FIBA's TOTAL row.
  const mine = players.filter((p) => p.teamId === teamId && p.stats.points !== null).map((p) => p.stats);
  const sum = (k) => mine.reduce((a, s) => a + s[k], 0);
  const t = teamRows[teamId].total;
  const x = teamExtras[teamId];
  const [tfgm, tfga] = pair(t.fg);
  const [t3m, t3a] = pair(t.three);
  const [tftm, tfta] = pair(t.ft);
  const checks = [
    ["points", sum("points"), t.points], ["FG made", sum("fgMade"), tfgm], ["FG att", sum("fgAttempted"), tfga],
    ["3PT made", sum("threeMade"), t3m], ["3PT att", sum("threeAttempted"), t3a], ["FT made", sum("ftMade"), tftm], ["FT att", sum("ftAttempted"), tfta],
    ["OREB", sum("offensiveRebounds") + x.oreb, t.oreb], ["DREB", sum("defensiveRebounds") + x.dreb, t.dreb],
    // Checked against OREB + DREB: FIBA's printed France REB total (32) disagrees with its own 13 + 20 (see notes).
    ["REB", sum("rebounds") + teamRows[teamId].teamRebounds, t.oreb + t.dreb], ["AST", sum("assists"), t.ast], ["PF", sum("fouls") + x.pf, t.pf],
    ["TO", sum("turnovers") + x.to, t.to], ["STL", sum("steals"), t.stl], ["BLK", sum("blocks"), t.blk],
  ];
  for (const [label, got, want] of checks) if (got !== want) problems.push(`${teamId} ${label}: players add to ${got}, FIBA total ${want}`);
  teams.push({ teamId, points: t.points, teamRebounds: teamRows[teamId].teamRebounds, playerOrder: order });
}

if (problems.length) {
  console.error("✗ Box score does not add up:\n  - " + problems.join("\n  - "));
  process.exit(1);
}

const ms = {
  matchId: "usa-vs-fra",
  sport: "basketball",
  classification: "historical",
  verification: "hand-entered",
  source: {
    name: "FIBA official box score",
    url: SOURCE_URL,
    attribution: "Box score: FIBA (fiba.basketball)",
    retrievedAt: new Date().toISOString().slice(0, 10),
  },
  notes: [
    "Copied row by row from FIBA's official box score (game 122608). Every player's points equal 2×2PT + 3×3PT + FT, and every column adds up to FIBA's team totals.",
    "Cross-checked with USA Basketball's release (agrees: Curry 8/12 3PT, Booker 6/10 FG). ESPN's box score differs on two lines (Curry 8-13 3PT, Booker 6-9 FG); FIBA, the official record, is used.",
    "FIBA's France total row prints REB 32, but its own OREB 13 + DREB 20 = 33, the player rows plus 3 team rebounds = 33, and ESPN shows 33. Player numbers are kept exactly as published; the team total is shown as 33 (OREB + DREB).",
    "Team rebounds (France 3, USA 2), one USA team turnover and one bench foul are not credited to any player, so player columns add up to the team total only with them.",
    "Not yet checked by a person: verification stays 'hand-entered' until someone confirms it against the FIBA page.",
  ],
  basketball: { teams },
  players,
};
fs.writeFileSync(process.argv[2], JSON.stringify(ms, null, 2) + "\n");
console.log(`✓ usa-vs-fra: ${players.length} players, every row and column checks against FIBA's totals`);
