"use client";

import { useState, type ReactNode } from "react";
import { dismissalText, madeOf, provenance, shooting, show } from "@/lib/stats/derive";
import type { MatchStats, PlayerMatchStats, Portrait } from "@/lib/stats/schema";
import { shortName } from "@/lib/ui/identity";
import { IconTimeline } from "../ui/icons";
import { TeamCrest } from "../ui/sport";
import { PlayerPhoto } from "./player-photo";
import { PlayerStatsSheet } from "./player-stats-sheet";
import { useMatchStats } from "./use-stats";

/** Where the numbers came from and how far they're checked, always shown with the numbers. */
function ProvenanceNote({ stats }: { stats: MatchStats }) {
  const label = provenance({ classification: stats.classification, verification: stats.verification, source: stats.source.name });
  return (
    <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
      <p className="flex flex-wrap items-center gap-2">
        <span className={`badge ${stats.classification === "historical" ? "badge-muted" : stats.classification === "demo" ? "badge-gold" : "badge-live"}`}>
          {stats.classification === "historical" ? "Historical" : stats.classification === "demo" ? "Demo data" : "Live"}
        </span>
        <span>
          {label}.{" "}
          <a href={stats.source.url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-fg">
            Source
          </a>
          {stats.source.license ? ` · ${stats.source.license}` : ""}
        </span>
      </p>
      <p>Player photos: Wikimedia Commons (tap a player for the credit). No photo means none with a reusable licence.</p>
    </div>
  );
}

function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented mb-4" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const th = "px-2 py-2 text-right font-medium";
const td = "px-2 py-2.5 text-right tabular-nums";

function NameCell({ p, portrait, sub, onOpen }: { p: PlayerMatchStats; portrait?: Portrait; sub?: string; onOpen: () => void }) {
  return (
    <td className="sticky left-0 z-[1] bg-surface py-2 pl-1 pr-2">
      <button onClick={onOpen} className="flex min-w-[150px] items-center gap-2.5 text-left hover:text-brand-2">
        <PlayerPhoto playerId={p.playerId} name={p.name} portrait={portrait} size={32} />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium leading-tight">{p.name}</span>
          {sub && <span className="block truncate text-[12px] leading-tight text-muted">{sub}</span>}
        </span>
      </button>
    </td>
  );
}

/* ------------------------------------------------------------------ cricket */

function CricketScorecard({ stats, portraits, onOpen }: { stats: MatchStats; portraits: Record<string, Portrait>; onOpen: (p: PlayerMatchStats) => void }) {
  const innings = stats.cricket?.innings ?? [];
  const [sel, setSel] = useState(String(innings[0]?.number ?? 1));
  const inn = innings.find((i) => String(i.number) === sel) ?? innings[0];
  if (!inn) return <p className="text-[14px] text-muted">No innings in this scorecard.</p>;
  const byId = new Map(stats.players.map((p) => [p.playerId, p]));
  const batters = inn.battingOrder.map((id) => byId.get(id)).filter((p): p is PlayerMatchStats => !!p);
  const bowlers = inn.bowlingOrder.map((id) => byId.get(id)).filter((p): p is PlayerMatchStats => !!p);
  const e = inn.extras;

  return (
    <div>
      <Tabs
        value={sel}
        onChange={setSel}
        options={innings.map((i) => ({
          id: String(i.number),
          label: (
            <span className="inline-flex items-center gap-2">
              <TeamCrest teamId={i.teamId} size={20} /> {shortName(i.teamId)} {i.runs}/{i.wickets}
            </span>
          ),
        }))}
      />
      <p className="mb-3 text-[13px] text-muted">
        {shortName(inn.teamId)} batting · {inn.runs}/{inn.wickets} in {inn.overs} overs{inn.target ? ` · target ${inn.target}` : ""}
      </p>

      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[560px] text-[14px]">
          <caption className="sr-only">Batting, innings {inn.number}</caption>
          <thead>
            <tr className="border-b border-line text-[12px] text-muted">
              <th className="sticky left-0 z-[1] bg-surface py-2 pl-1 pr-2 text-left font-medium">Batter</th>
              <th className={th} title="Runs">R</th>
              <th className={th} title="Balls faced">B</th>
              <th className={th} title="Fours">4s</th>
              <th className={th} title="Sixes">6s</th>
              <th className={th} title="Strike rate: runs ÷ balls × 100">SR</th>
            </tr>
          </thead>
          <tbody>
            {batters.map((p) => {
              const b = p.stats.sport === "cricket" ? p.stats.batting : null;
              if (!b) return null;
              return (
                <tr key={p.playerId} className="border-b border-line/60">
                  <NameCell p={p} portrait={portraits[p.playerId]} sub={b.notOut ? "not out" : b.dismissal ? dismissalText(b.dismissal) : ""} onOpen={() => onOpen(p)} />
                  <td className={`${td} font-semibold`}>
                    {b.runs}
                    {b.notOut ? "*" : ""}
                  </td>
                  <td className={td}>{b.balls}</td>
                  <td className={td}>{b.fours}</td>
                  <td className={td}>{b.sixes}</td>
                  <td className={td}>{show(b.strikeRate)}</td>
                </tr>
              );
            })}
            <tr className="border-b border-line/60 text-[13px] text-muted">
              <td className="sticky left-0 bg-surface py-2.5 pl-1">Extras</td>
              <td className={`${td} text-fg`}>{e.total}</td>
              <td className="px-2 py-2.5 text-right" colSpan={4}>
                wd {e.wides}, nb {e.noballs}, b {e.byes}, lb {e.legbyes}
                {e.penalty ? `, pen ${e.penalty}` : ""}
              </td>
            </tr>
            <tr className="font-semibold">
              <td className="sticky left-0 bg-surface py-2.5 pl-1">Total</td>
              <td className={td}>
                {inn.runs}/{inn.wickets}
              </td>
              <td className="px-2 py-2.5 text-right text-[13px] font-normal text-muted" colSpan={4}>
                {inn.overs} overs
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {inn.didNotBat.length > 0 && (
        <p className="mt-2 text-[13px] text-muted">Did not bat: {inn.didNotBat.map((id) => byId.get(id)?.name ?? id).join(", ")}</p>
      )}

      <div className="-mx-1 mt-6 overflow-x-auto">
        <table className="w-full min-w-[560px] text-[14px]">
          <caption className="sr-only">Bowling, innings {inn.number}</caption>
          <thead>
            <tr className="border-b border-line text-[12px] text-muted">
              <th className="sticky left-0 z-[1] bg-surface py-2 pl-1 pr-2 text-left font-medium">Bowler</th>
              <th className={th} title="Overs">O</th>
              <th className={th} title="Maidens">M</th>
              <th className={th} title="Runs conceded">R</th>
              <th className={th} title="Wickets">W</th>
              <th className={th} title="Economy: runs conceded ÷ overs">Econ</th>
              <th className={th} title="Wides / no-balls">WD/NB</th>
            </tr>
          </thead>
          <tbody>
            {bowlers.map((p) => {
              const w = p.stats.sport === "cricket" ? p.stats.bowling : null;
              if (!w) return null;
              return (
                <tr key={p.playerId} className="border-b border-line/60">
                  <NameCell p={p} portrait={portraits[p.playerId]} sub={`${w.dots} dot balls`} onOpen={() => onOpen(p)} />
                  <td className={td}>{w.overs}</td>
                  <td className={td}>{w.maidens}</td>
                  <td className={td}>{w.runs}</td>
                  <td className={`${td} font-semibold`}>{w.wickets}</td>
                  <td className={td}>{show(w.economy)}</td>
                  <td className={td}>
                    {show(w.wides)}/{show(w.noballs)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ basketball */

function BoxScore({ stats, portraits, onOpen }: { stats: MatchStats; portraits: Record<string, Portrait>; onOpen: (p: PlayerMatchStats) => void }) {
  const teams = stats.basketball?.teams ?? [];
  const [sel, setSel] = useState(teams[0]?.teamId ?? "");
  const team = teams.find((t) => t.teamId === sel) ?? teams[0];
  if (!team) return <p className="text-[14px] text-muted">No teams in this box score.</p>;
  const byId = new Map(stats.players.map((p) => [p.playerId, p]));
  const rows = team.playerOrder.map((id) => byId.get(id)).filter((p): p is PlayerMatchStats => !!p);
  const played = rows.filter((p) => p.stats.sport === "basketball" && p.stats.points !== null);
  const dnp = rows.filter((p) => p.stats.sport === "basketball" && p.stats.points === null);
  const starters = played.filter((p) => p.stats.sport === "basketball" && p.stats.starter);
  const bench = played.filter((p) => p.stats.sport === "basketball" && !p.stats.starter);

  const Row = ({ p }: { p: PlayerMatchStats }) => {
    const s = p.stats.sport === "basketball" ? p.stats : null;
    if (!s) return null;
    const sh = shooting(s);
    return (
      <tr className="border-b border-line/60">
        <NameCell p={p} portrait={portraits[p.playerId]} sub={s.starter ? "Starter" : "Bench"} onOpen={() => onOpen(p)} />
        <td className={td}>{show(s.minutes)}</td>
        <td className={`${td} font-semibold`}>{show(s.points)}</td>
        <td className={td}>{show(s.rebounds)}</td>
        <td className={td}>{show(s.assists)}</td>
        <td className={td}>{show(s.steals)}</td>
        <td className={td}>{show(s.blocks)}</td>
        <td className={td}>{show(s.turnovers)}</td>
        <td className={td}>
          {madeOf(s.fgMade, s.fgAttempted)} <span className="text-muted">{sh.fgPct !== null ? `${sh.fgPct}%` : ""}</span>
        </td>
        <td className={td}>
          {madeOf(s.threeMade, s.threeAttempted)} <span className="text-muted">{sh.threePct !== null ? `${sh.threePct}%` : ""}</span>
        </td>
        <td className={td}>
          {madeOf(s.ftMade, s.ftAttempted)} <span className="text-muted">{sh.ftPct !== null ? `${sh.ftPct}%` : ""}</span>
        </td>
        <td className={td}>{s.plusMinus === null ? "—" : s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus}</td>
      </tr>
    );
  };

  const group = (label: string, list: PlayerMatchStats[]) =>
    list.length > 0 && (
      <>
        <tr>
          <td colSpan={12} className="sticky left-0 bg-surface pb-1 pl-1 pt-3 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
            {label}
          </td>
        </tr>
        {list.map((p) => (
          <Row key={p.playerId} p={p} />
        ))}
      </>
    );

  return (
    <div>
      <Tabs
        value={team.teamId}
        onChange={setSel}
        options={teams.map((t) => ({
          id: t.teamId,
          label: (
            <span className="inline-flex items-center gap-2">
              <TeamCrest teamId={t.teamId} size={20} /> {shortName(t.teamId)} {t.points}
            </span>
          ),
        }))}
      />
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[860px] text-[14px]">
          <caption className="sr-only">{shortName(team.teamId)} box score</caption>
          <thead>
            <tr className="border-b border-line text-[12px] text-muted">
              <th className="sticky left-0 z-[1] bg-surface py-2 pl-1 pr-2 text-left font-medium">Player</th>
              <th className={th} title="Minutes">MIN</th>
              <th className={th} title="Points">PTS</th>
              <th className={th} title="Rebounds">REB</th>
              <th className={th} title="Assists">AST</th>
              <th className={th} title="Steals">STL</th>
              <th className={th} title="Blocks">BLK</th>
              <th className={th} title="Turnovers">TO</th>
              <th className={th} title="Field goals made/attempted, FG% = made ÷ attempted">FG</th>
              <th className={th} title="Three-pointers made/attempted">3PT</th>
              <th className={th} title="Free throws made/attempted">FT</th>
              <th className={th} title="Points difference while on court">+/-</th>
            </tr>
          </thead>
          <tbody>
            {group("Starters", starters)}
            {group("Bench", bench)}
          </tbody>
        </table>
      </div>
      {dnp.length > 0 && <p className="mt-2 text-[13px] text-muted">Did not play: {dnp.map((p) => p.name).join(", ")}</p>}
      {team.teamRebounds ? <p className="mt-1 text-[13px] text-muted">Team rebounds (not credited to a player): {team.teamRebounds}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ panel */

/**
 * The match's player statistics: full cricket scorecard or basketball box score, with photos, every number's
 * source, and a tap-through to each player's detail. Shows `fallback` when the match has no statistics.
 */
export function MatchStatsPanel({ matchId, fallback }: { matchId: string; fallback?: ReactNode }) {
  const state = useMatchStats(matchId);
  const [open, setOpen] = useState<PlayerMatchStats | null>(null);

  if (state.status === "none") return <>{fallback ?? null}</>;

  const title = state.status === "ready" && state.stats.sport === "basketball" ? "Box score" : "Scorecard";
  return (
    <section className="card p-5 md:p-6" aria-busy={state.status === "loading"}>
      <h2 className="mb-4 inline-flex items-center gap-2 text-[16px] font-semibold">
        <span className="text-brand-2">
          <IconTimeline size={18} />
        </span>
        {state.status === "loading" ? "Player statistics" : title}
      </h2>

      {state.status === "loading" && (
        <div className="space-y-2" aria-label="Loading statistics">
          <div className="skeleton h-10" />
          <div className="skeleton h-48" />
        </div>
      )}
      {state.status === "error" && (
        <p role="status" className="rounded-[var(--r-md)] border border-line bg-surface-2 p-4 text-[14px] text-muted">
          {state.message} Statistics are unavailable right now; the rest of the match page still works.
        </p>
      )}
      {state.status === "ready" && (
        <>
          {state.stats.sport === "cricket" ? (
            <CricketScorecard stats={state.stats} portraits={state.portraits} onOpen={setOpen} />
          ) : (
            <BoxScore stats={state.stats} portraits={state.portraits} onOpen={setOpen} />
          )}
          <ProvenanceNote stats={state.stats} />
          {open && (
            <PlayerStatsSheet
              record={open}
              matchStats={state.stats}
              portraits={state.portraits}
              onClose={() => setOpen(null)}
              onSwitch={setOpen}
            />
          )}
        </>
      )}
    </section>
  );
}
