# Cricsheet source files

Ball-by-ball match data from [Cricsheet](https://cricsheet.org/), released under the
[Open Data Commons Attribution License](https://opendatacommons.org/licenses/by/1-0/).
Data: Cricsheet (https://cricsheet.org).

| File | Match | Imported into |
|---|---|---|
| `1473511.json` | IPL 2025 Final, RCB v Punjab Kings, 3 June 2025 | `data/stats/rcb-vs-pbks.json` |
| `1535465.json` | IPL 2026 Final, Gujarat Titans v RCB, 31 May 2026 | `data/stats/rcb-vs-gt.json` |

Re-run the import with `npm run import-scorecard -- data/sources/cricsheet/<file>.json <matchId>`.
