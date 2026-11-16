"use client";

import { useEffect, useMemo, useState } from "react";
import { comparePlayers } from "@/lib/stats/compare";
import { dismissalText, lineOf, madeOf, provenance, shooting, show } from "@/lib/stats/derive";
import type { MatchStats, PlayerMatchStats, Portrait } from "@/lib/stats/schema";
import { shortName } from "@/lib/ui/identity";
import { BuzzerAvatar } from "../buzzer-avatar";
import { useFriend } from "../friend-provider";
import { IconX } from "../ui/icons";
import { TeamCrest } from "../ui/sport";
import { PhotoCredit, PlayerPhoto } from "./player-photo";
import { usePlayerHistory } from "./use-stats";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-line bg-surface-2 px-3 py-2.5" title={hint}>
      <p className="text-[11.5px] uppercase tracking-wider text-muted">{label}</p>
      <p className="font-display text-[22px] font-bold leading-tight tabular-nums">{value}</p>
    </div>
  );
}

/** This match's numbers for one player, laid out for reading, not scanning. */
function ThisMatch({ r }: { r: PlayerMatchStats }) {
  const s = r.stats;
  if (s.sport === "basketball") {
    if (s.points === null) return <p className="text-[14px] text-muted">{s.note ?? "No statistics"} in this match.</p>;
    const sh = shooting(s);
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <Stat label="Points" value={show(s.points)} />
        <Stat label="Rebounds" value={show(s.rebounds)} hint={`${show(s.offensiveRebounds)} offensive, ${show(s.defensiveRebounds)} defensive`} />
        <Stat label="Assists" value={show(s.assists)} />
        <Stat label="Minutes" value={show(s.minutes)} />
        <Stat label="FG" value={madeOf(s.fgMade, s.fgAttempted)} hint={sh.fgPct !== null ? `${sh.fgPct}% (made ÷ attempted)` : undefined} />
        <Stat label="FG%" value={sh.fgPct === null ? "—" : `${sh.fgPct}`} hint="field goals made ÷ attempted × 100" />
        <Stat label="3PT" value={madeOf(s.threeMade, s.threeAttempted)} hint={sh.threePct !== null ? `${sh.threePct}%` : undefined} />
        <Stat label="FT" value={madeOf(s.ftMade, s.ftAttempted)} hint={sh.ftPct !== null ? `${sh.ftPct}%` : undefined} />
        <Stat label="Steals" value={show(s.steals)} />
        <Stat label="Blocks" value={show(s.blocks)} />
        <Stat label="Turnovers" value={show(s.turnovers)} />
        <Stat label="+/-" value={s.plusMinus === null ? "—" : s.plusMinus > 0 ? `+${s.plusMinus}` : String(s.plusMinus)} hint="points difference while on court" />
      </div>
    );
  }
  const b = s.batting;
  const w = s.bowling;
  if (!b && !w) return <p className="text-[14px] text-muted">{s.didNotBat ? "In the XI, but didn't bat or bowl." : "No statistics in this match."}</p>;
  return (
    <div className="space-y-4">
      {b && (
        <div>
          <p className="eyebrow mb-2">Batting</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <Stat label="Runs" value={`${b.runs}${b.notOut ? "*" : ""}`} />
            <Stat label="Balls" value={String(b.balls)} />
            <Stat label="Strike rate" value={show(b.strikeRate)} hint="runs ÷ balls × 100" />
            <Stat label="4s" value={String(b.fours)} />
            <Stat label="6s" value={String(b.sixes)} />
          </div>
          <p className="mt-2 text-[13px] text-muted">{b.notOut ? "Not out" : b.dismissal ? `Out: ${dismissalText(b.dismissal)}` : "Out"}</p>
        </div>
      )}
      {w && (
        <div>
          <p className="eyebrow mb-2">Bowling</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <Stat label="Overs" value={w.overs} />
            <Stat label="Wickets" value={String(w.wickets)} />
            <Stat label="Runs" value={String(w.runs)} hint="runs conceded (bat + wides + no-balls)" />
            <Stat label="Economy" value={show(w.economy)} hint="runs conceded ÷ overs" />
            <Stat label="Dots" value={String(w.dots)} />
          </div>
          <p className="mt-2 text-[13px] text-muted">
            {w.maidens} maiden{w.maidens === 1 ? "" : "s"} · {show(w.wides)} wide{w.wides === 1 ? "" : "s"} · {show(w.noballs)} no-ball{w.noballs === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}

/** Quick questions that fit this player's numbers. */
function questionsFor(r: PlayerMatchStats, matchLabel: string): string[] {
  const first = r.name.split(" ").slice(-1)[0];
  const s = r.stats;
  const qs = [`Explain ${r.name}'s performance in ${matchLabel}.`];
  if (s.sport === "cricket") {
    if (s.batting) qs.push(`Why was ${first}'s strike rate ${show(s.batting.strikeRate)} in this match?`);
    if (s.bowling) qs.push(`Was ${first}'s economy of ${show(s.bowling.economy)} good here?`);
  } else if (s.points !== null) {
    const sh = shooting(s);
    qs.push(`Why did ${first} score ${s.points} points${sh.fgPct !== null ? ` on ${sh.fgPct}% shooting` : ""}?`);
    qs.push(`What does ${first}'s plus/minus of ${show(s.plusMinus)} mean?`);
  }
  qs.push(`How does this compare with ${first}'s other matches?`);
  return qs;
}

/**
 * A player's detail: photo, team, this match, their other matches with statistics, a fair two-player comparison,
 * and "Ask Buzzer", which opens the existing Buzzer conversation with this player's statistics in context.
 */
export function PlayerStatsSheet({
  record: r,
  matchStats,
  portraits,
  onClose,
  onSwitch,
}: {
  record: PlayerMatchStats;
  matchStats: MatchStats;
  portraits: Record<string, Portrait>;
  onClose: () => void;
  onSwitch: (p: PlayerMatchStats) => void;
}) {
  const { setCtx, setOpen, send, busy } = useFriend();
  const history = usePlayerHistory(r.playerId);
  const [compareId, setCompareId] = useState("");
  const portrait = portraits[r.playerId] ?? null;
  const other = matchStats.players.find((p) => p.playerId === compareId) ?? null;
  const comparison = useMemo(() => (other ? comparePlayers(r, other) : null), [r, other]);
  const otherMatches = (history ?? []).filter((h) => h.matchId !== r.matchId);
  const matchLabel = history?.find((h) => h.matchId === r.matchId)?.match?.competition ?? "this match";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function ask(question: string, withCompare = false) {
    if (busy) return;
    const ids = withCompare && other ? [r.playerId, other.playerId] : [r.playerId];
    setCtx({
      surface: "player",
      label: `${ids.length > 1 ? `${r.name} vs ${other!.name}` : r.name} statistics, ${matchLabel}`,
      entityIds: ids.filter((id) => id.startsWith("player:")),
      stats: { matchId: r.matchId, playerIds: ids },
    });
    onClose();
    setOpen(true);
    void send(question);
  }

  const teams = [...new Set(matchStats.players.map((p) => p.teamId))];

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/60 md:items-center" onClick={onClose}>
      <section
        role="dialog"
        aria-label={`${r.name} statistics`}
        onClick={(e) => e.stopPropagation()}
        className="anim-slide-up max-h-[90dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[28px] border border-line bg-bg p-5 pb-8 md:rounded-[28px]"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <PlayerPhoto playerId={r.playerId} name={r.name} portrait={portrait} size={76} />
            <div className="min-w-0">
              <h2 className="truncate text-[22px] font-bold leading-tight">{r.name}</h2>
              <p className="mt-1 inline-flex items-center gap-2 text-[14px] text-muted">
                <TeamCrest teamId={r.teamId} size={20} /> {shortName(r.teamId)} · {matchLabel}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="icon-btn h-10 w-10 shrink-0">
            <IconX size={18} />
          </button>
        </header>
        {portrait && (
          <div className="mt-2">
            <PhotoCredit portrait={portrait} />
          </div>
        )}

        <section className="mt-5">
          <h3 className="mb-3 text-[16px] font-semibold">This match</h3>
          <ThisMatch r={r} />
          <p className="mt-3 text-[12px] text-muted">
            {provenance(r)}.{" "}
            <a href={r.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-fg">
              Source
            </a>
          </p>
        </section>

        <section className="mt-6">
          <h3 className="mb-2 text-[16px] font-semibold">Other matches</h3>
          {history === null ? (
            <div className="skeleton h-12" aria-label="Loading" />
          ) : otherMatches.length === 0 ? (
            <p className="text-[14px] text-muted">
              No other matches with statistics for {r.name} yet. Buzzer won&apos;t guess at their record.
            </p>
          ) : (
            <ul className="space-y-2">
              {otherMatches.map((h) => (
                <li key={h.matchId} className="rounded-[var(--r-md)] border border-line bg-surface-2 px-3.5 py-2.5">
                  <p className="text-[13px] font-semibold">{h.match?.competition ?? h.matchId}</p>
                  <p className="text-[13.5px] text-muted">{lineOf(h)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6">
          <h3 className="mb-2 text-[16px] font-semibold">Compare</h3>
          <select
            value={compareId}
            onChange={(e) => setCompareId(e.target.value)}
            aria-label="Compare with another player from this match"
            className="field w-full !rounded-[var(--r-md)] !py-2.5 text-[14px]"
          >
            <option value="">Compare with another player in this match…</option>
            {teams.map((t) => (
              <optgroup key={t} label={shortName(t)}>
                {matchStats.players
                  .filter((p) => p.teamId === t && p.playerId !== r.playerId)
                  .map((p) => (
                    <option key={p.playerId} value={p.playerId}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          {comparison && !comparison.ok && <p className="mt-3 text-[14px] text-muted">{comparison.reason}</p>}
          {comparison?.ok && other && (
            <div className="mt-3">
              <table className="w-full text-[14px] tabular-nums">
                <thead>
                  <tr className="border-b border-line text-[12px] text-muted">
                    <th className="py-2 text-left font-medium"> </th>
                    <th className="py-2 text-right font-medium">{r.name.split(" ").slice(-1)[0]}</th>
                    <th className="py-2 text-right font-medium">
                      <button onClick={() => onSwitch(other)} className="hover:text-brand-2">
                        {other.name.split(" ").slice(-1)[0]}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((row) => (
                    <tr key={row.label} className="border-b border-line/60" title={row.formula}>
                      <td className="py-2 text-muted">{row.label}</td>
                      <td className={`py-2 text-right ${row.better === "a" ? "font-semibold text-good" : ""}`}>{row.a}</td>
                      <td className={`py-2 text-right ${row.better === "b" ? "font-semibold text-good" : ""}`}>{row.b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="mt-2 space-y-1 text-[12.5px] text-muted">
                {comparison.caveats.map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
              <button
                onClick={() => ask(`Compare ${r.name} and ${other.name} in ${matchLabel}. What do the numbers say, and what do you make of it?`, true)}
                disabled={busy}
                className="btn-quiet mt-3 h-11 w-full text-[14px]"
              >
                Ask Buzzer to compare them
              </button>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-[var(--r-lg)] border border-brand/30 bg-gradient-to-br from-brand/10 to-transparent p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <BuzzerAvatar size={30} />
            <p className="text-[14px] font-semibold">Ask Buzzer about this performance</p>
          </div>
          <div className="flex flex-col gap-1.5">
            {questionsFor(r, matchLabel).map((q, i) => (
              <button
                key={q}
                onClick={() => ask(q)}
                disabled={busy}
                className={
                  i === 0
                    ? "btn-primary h-11 justify-start px-4 text-[14px]"
                    : "rounded-[var(--r-md)] border border-line bg-surface-2 px-3.5 py-2.5 text-left text-[13.5px] transition-colors hover:border-brand/50 disabled:opacity-50"
                }
              >
                {q}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-muted">Buzzer answers from these exact numbers, and says so when something isn&apos;t in the data.</p>
        </section>
      </section>
    </div>
  );
}
