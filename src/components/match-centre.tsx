"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import type { PageContext } from "@/lib/friend/context";
import type { TimelineBall } from "@/lib/match/data";
import type { MatchSummary, TeamSide } from "@/lib/match/view";
import { sportLabel } from "@/lib/ui/identity";
import { BuzzerAvatar } from "./buzzer-avatar";
import { useSuggestions } from "./buzzer/conversation";
import { useFriend } from "./friend-provider";
import { NudgeCard } from "./nudge-card";
import { PlayerSheet, type SheetPlayer } from "./player-sheet";
import { MatchStatsPanel } from "./stats/match-stats-panel";
import {
  IconChat,
  IconChevronLeft,
  IconClock,
  IconPlay,
  IconStar,
  IconTimeline,
  IconTrophy,
  IconUsers,
} from "./ui/icons";
import { EntityAvatar, StatusBadge, TeamCrest, formatDate } from "./ui/sport";

type Player = {
  name: string;
  role?: string;
  entityId?: string;
  summary?: string;
};
type Team = { id: string; name: string; players: Player[] };

/* ------------------------------------------------------------------ scoreboard */

function ScoreSide({
  team,
  score,
  detail,
  won,
  align,
}: {
  team: TeamSide;
  score?: string;
  detail?: string;
  won?: boolean;
  align: "left" | "right";
}) {
  const right = align === "right";
  return (
    <div
      className={`flex items-center gap-4 @2xl:gap-5 ${right ? "@2xl:flex-row-reverse @2xl:text-right" : ""}`}
    >
      <TeamCrest
        teamId={team.id}
        size={72}
        className="@2xl:!h-[92px] @2xl:!w-[92px] @2xl:!text-[28px]"
      />
      <div className="min-w-0 flex-1">
        <p className="font-display text-[30px] font-extrabold uppercase leading-none tracking-wide @2xl:text-[40px]">
          {team.code}
        </p>
        <p className="mt-1 truncate text-[13px] text-fg/70 @2xl:text-[14px]">
          {team.name}
        </p>
      </div>
      {score && (
        <div
          className={`shrink-0 text-right @2xl:hidden ${won === false ? "text-fg/55" : ""}`}
        >
          <p className="font-display text-[34px] font-bold leading-none tabular-nums">
            {score}
          </p>
          {detail && <p className="mt-1 text-[11px] text-fg/60">{detail}</p>}
        </div>
      )}
    </div>
  );
}

function Scoreboard({ m, onAsk }: { m: MatchSummary; onAsk: () => void }) {
  const [a, b] = m.teams;
  const r = m.result;
  const date = formatDate(m.date);
  const won = (id: string) => (r?.winner ? r.winner === id : undefined);

  return (
    <section
      aria-label="Scoreboard"
      className="@container relative overflow-hidden rounded-[var(--r-xl)] border border-line"
      style={{
        background: `radial-gradient(80% 140% at 0% 0%, ${a.primary}66 0%, transparent 60%), radial-gradient(80% 140% at 100% 0%, ${b.primary}66 0%, transparent 60%), linear-gradient(180deg, #121827, #0b0f18)`,
      }}
    >
      <div className="pitch-lines absolute inset-0 opacity-70" aria-hidden />
      <div className="relative px-5 pb-6 pt-5 @2xl:px-10 @2xl:pb-8 @2xl:pt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] font-semibold text-fg/75">
            {[m.competition, date, m.venue].filter(Boolean).join(" · ")}
          </p>
          <StatusBadge status={m.status} hasClip={m.hasClip} />
        </div>

        <div className="mt-6 grid gap-4 @2xl:mt-8 @2xl:grid-cols-[1fr_auto_1fr] @2xl:items-center @2xl:gap-6">
          <ScoreSide
            team={a}
            score={r?.scores[a.id]}
            detail={r?.detail?.[a.id]}
            won={won(a.id)}
            align="left"
          />
          <div className="hidden flex-col items-center @2xl:flex">
            {r ? (
              <div className="flex items-baseline gap-4 font-display font-bold tabular-nums">
                <span
                  className={`text-[56px] leading-none ${won(a.id) === false ? "text-fg/50" : ""}`}
                >
                  {r.scores[a.id]}
                </span>
                <span className="text-[28px] text-subtle">–</span>
                <span
                  className={`text-[56px] leading-none ${won(b.id) === false ? "text-fg/50" : ""}`}
                >
                  {r.scores[b.id]}
                </span>
              </div>
            ) : (
              <span className="font-display text-[34px] font-bold uppercase tracking-widest text-subtle">
                vs
              </span>
            )}
            {r?.detail && (
              <p className="mt-2 text-[12px] text-fg/60">
                {r.detail[a.id]} · {r.detail[b.id]}
              </p>
            )}
          </div>
          <ScoreSide
            team={b}
            score={r?.scores[b.id]}
            detail={r?.detail?.[b.id]}
            won={won(b.id)}
            align="right"
          />
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-white/10 pt-5 @2xl:mt-8 @2xl:flex-row @2xl:items-center @2xl:justify-between">
          <p
            className={`inline-flex items-center gap-2 text-[15px] font-semibold ${r ? "text-good" : "text-fg/75"}`}
          >
            {r ? <IconTrophy size={18} /> : <IconClock size={18} />}
            {r?.summary ??
              (m.status === "upcoming"
                ? "Yet to start — ask Buzzer what to watch for"
                : "Result to come")}
          </p>
          <div className="flex flex-wrap gap-2">
            {m.hasClip && (
              <Link
                href={`/match/${m.id}/watch`}
                className="btn-primary h-12 px-6 text-[15px]"
              >
                <IconPlay size={15} /> Watch along with Buzzer
              </Link>
            )}
            <button onClick={onAsk} className="btn-quiet h-12 px-5 text-[15px]">
              <IconChat size={17} /> Ask about this match
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ sections */

function Panel({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 md:p-6 ${className}`}>
      <h2 className="mb-4 inline-flex items-center gap-2 text-[16px] font-semibold">
        {icon && <span className="text-brand-2">{icon}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Linescore({ m }: { m: MatchSummary }) {
  const periods = m.result?.periods;
  if (!periods?.length) return null;
  return (
    <Panel title="Linescore" icon={<IconTimeline size={18} />}>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[360px] text-[14px] tabular-nums">
          <thead>
            <tr className="text-[12px] text-muted">
              <th className="px-1 pb-2 text-left font-semibold">Team</th>
              {periods.map((p) => (
                <th
                  key={p.label}
                  className="px-1 pb-2 text-center font-semibold"
                >
                  {p.label}
                </th>
              ))}
              <th className="px-1 pb-2 text-right font-semibold">T</th>
            </tr>
          </thead>
          <tbody>
            {m.teams.map((t) => (
              <tr key={t.id} className="border-t border-line">
                <td className="px-1 py-2.5">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <TeamCrest teamId={t.id} size={26} /> {t.code}
                  </span>
                </td>
                {periods.map((p) => {
                  const other = m.teams.find((x) => x.id !== t.id)!;
                  const won = (p.scores[t.id] ?? 0) > (p.scores[other.id] ?? 0);
                  return (
                    <td
                      key={p.label}
                      className={`px-1 py-2.5 text-center ${won ? "font-semibold text-fg" : "text-muted"}`}
                    >
                      {p.scores[t.id] ?? "–"}
                    </td>
                  );
                })}
                <td className="px-1 py-2.5 text-right font-display text-[20px] font-bold">
                  {m.result?.scores[t.id]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Performers({
  m,
  onPlayer,
}: {
  m: MatchSummary;
  onPlayer: (p: SheetPlayer) => void;
}) {
  const list = m.result?.performers;
  if (!list?.length) return null;
  return (
    <Panel title="Top performers" icon={<IconStar size={18} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((p) => {
          const team = m.teams.find((t) => t.id === p.team);
          return (
            <button
              key={p.name}
              onClick={() => onPlayer({ name: p.name, entityId: p.entityId })}
              className="flex items-center gap-3 rounded-[var(--r-md)] border border-line bg-surface-2 p-3 text-left transition-colors hover:border-line-strong"
            >
              <EntityAvatar id={p.entityId} name={p.name} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold">
                  {p.name}
                </span>
                <span className="block truncate text-[12px] text-muted">
                  {p.note ?? team?.code}
                </span>
              </span>
              <span className="shrink-0 font-display text-[20px] font-bold tabular-nums">
                {p.line}
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/** Key moments: ball-by-ball when a timeline was imported, otherwise the running score by period. */
function Timeline({
  m,
  timeline,
}: {
  m: MatchSummary;
  timeline: TimelineBall[];
}) {
  const key = timeline.filter((b) => /wicket|out|six|four/i.test(b.event));
  if (key.length) {
    return (
      <Panel title="Key moments" icon={<IconTimeline size={18} />}>
        <ol className="relative space-y-3 border-l border-line pl-5">
          {key.slice(-12).map((b) => (
            <li key={`${b.t}-${b.over}`} className="relative">
              <span
                className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ${/wicket|out/i.test(b.event) ? "bg-brand" : "bg-gold"}`}
              />
              <p className="text-[14px]">
                <span className="font-semibold">{b.over}</span> · {b.batter} vs{" "}
                {b.bowler} — <span className="font-semibold">{b.event}</span>
              </p>
              <p className="text-[12px] text-muted">
                {b.battingTeam} {b.score}
              </p>
            </li>
          ))}
        </ol>
      </Panel>
    );
  }
  const periods = m.result?.periods;
  if (!periods?.length) return null;
  const [a, b] = m.teams;
  // Running totals after each period.
  const rows = periods.reduce<
    { label: string; scores: Record<string, number>; ta: number; tb: number }[]
  >((acc, p) => {
    const prev = acc[acc.length - 1];
    acc.push({
      ...p,
      ta: (prev?.ta ?? 0) + (p.scores[a.id] ?? 0),
      tb: (prev?.tb ?? 0) + (p.scores[b.id] ?? 0),
    });
    return acc;
  }, []);
  return (
    <Panel title="How it unfolded" icon={<IconTimeline size={18} />}>
      <ol className="relative space-y-4 border-l border-line pl-5">
        {rows.map((p) => {
          const { ta, tb } = p;
          const lead =
            ta === tb
              ? "Level"
              : `${ta > tb ? a.code : b.code} lead by ${Math.abs(ta - tb)}`;
          const won =
            (p.scores[a.id] ?? 0) === (p.scores[b.id] ?? 0)
              ? null
              : (p.scores[a.id] ?? 0) > (p.scores[b.id] ?? 0)
                ? a
                : b;
          return (
            <li key={p.label} className="relative">
              <span className="brand-gradient absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full" />
              <p className="text-[14.5px] font-semibold">
                End of {p.label}: {a.code} {ta} – {tb} {b.code}
              </p>
              <p className="text-[12.5px] text-muted">
                {won
                  ? `${won.code} won the ${p.label} ${p.scores[won.id]}–${p.scores[(won.id === a.id ? b : a).id]}`
                  : "Quarter shared"}{" "}
                · {lead}
              </p>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/* ------------------------------------------------------------------ page */

export function MatchCentre({
  match: m,
  title,
  timeline,
  teams,
  entityIds,
}: {
  match: MatchSummary;
  title: string;
  timeline: TimelineBall[];
  teams: Team[];
  entityIds: string[];
}) {
  const { setCtx, setOpen, send, busy, state, refreshState } = useFriend();
  const [sheet, setSheet] = useState<SheetPlayer | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [pickError, setPickError] = useState("");

  // [stats] `stats.matchId` lets Buzzer read this match's scorecard / box score when the fan asks about it.
  const context = useMemo<PageContext>(
    () => ({
      surface: "match",
      label: `${title} match page`,
      entityIds,
      stats: { matchId: m.id, playerIds: [] },
    }),
    [title, entityIds, m.id],
  );
  useEffect(() => setCtx(context), [context, setCtx]);
  const suggestions = useSuggestions(!!state?.onboarded);

  // The players the fan picked for their team.
  useEffect(() => {
    let cancelled = false;
    api<{ picks: string[] }>("/api/picks")
      .then((r) => !cancelled && setPicks(r.picks))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function togglePick(p: Player) {
    const key = p.entityId ?? `name:${p.name}`;
    const picked = !picks.includes(key);
    const before = picks;
    setPickError("");
    setPicks(picked ? [...picks, key] : picks.filter((k) => k !== key)); // optimistic
    try {
      const r = await api<{ picks: string[] }>("/api/picks", { key, picked });
      setPicks(r.picks);
      refreshState().catch(() => {}); // picks steer what Buzzer brings up
    } catch (e) {
      setPicks(before);
      setPickError((e as Error).message);
    }
  }

  const ask = (q: string) => {
    if (busy) return;
    setCtx(context);
    setOpen(true);
    void send(q);
  };

  return (
    <main className="page @container pb-nav pt-4 md:pt-6">
      <Link href="/matches" className="btn-ghost mb-4 h-9 px-3 text-[14px]">
        <IconChevronLeft size={17} /> Matches
      </Link>

      <Scoreboard
        m={m}
        onAsk={() =>
          ask(`Tell me about ${m.teams[0].short} vs ${m.teams[1].short}`)
        }
      />

      <div className="mt-6 grid gap-5 @4xl:grid-cols-[minmax(0,1fr)_360px] @6xl:grid-cols-[minmax(0,1fr)_400px] @6xl:gap-6">
        <div className="min-w-0 space-y-5">
          <Performers m={m} onPlayer={setSheet} />
          <div className="grid gap-5 @7xl:grid-cols-2">
            <Linescore m={m} />
            <Timeline m={m} timeline={timeline} />
          </div>

          {/* [stats] The scorecard / box score. Matches without statistics keep the squad list below as the fallback. */}
          <MatchStatsPanel
            matchId={m.id}
            fallback={
              <Panel title="Squads & your team" icon={<IconUsers size={18} />}>
                <p
                  className="-mt-2 mb-4 text-[13px] text-muted"
                  aria-live="polite"
                >
                  Tap <IconStar size={12} className="inline" /> to pick a player
                  — Buzzer uses your picks to decide what to bring up.{" "}
                  {picks.length}/11 picked.
                </p>
                {pickError && (
                  <p className="mb-3 text-[13px] text-brand-2">{pickError}</p>
                )}
                <div className="grid gap-6 md:grid-cols-2">
                  {teams.map((team) => (
                    <div key={team.id}>
                      <h3 className="mb-3 inline-flex items-center gap-2 text-[14px] font-semibold">
                        <TeamCrest teamId={team.id} size={28} /> {team.name}
                      </h3>
                      {team.players.length === 0 ? (
                        <p className="text-[13px] text-muted">
                          Squad not announced yet.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {team.players.map((p) => {
                            const mine = picks.includes(
                              p.entityId ?? `name:${p.name}`,
                            );
                            return (
                              <li key={p.name} className="relative">
                                <button
                                  onClick={() => setSheet(p)}
                                  className={`flex w-full items-center gap-3 rounded-[var(--r-md)] border py-2.5 pl-2.5 pr-12 text-left transition-colors hover:border-line-strong ${
                                    mine
                                      ? "border-gold/50 bg-gold/5"
                                      : "border-line bg-surface-2"
                                  }`}
                                >
                                  <EntityAvatar
                                    id={p.entityId}
                                    name={p.name}
                                    size={36}
                                  />
                                  <span className="min-w-0">
                                    <span className="block truncate text-[14px] font-medium leading-tight">
                                      {p.name}
                                    </span>
                                    {p.role && (
                                      <span className="mt-0.5 block text-[12px] text-muted">
                                        {p.role}
                                      </span>
                                    )}
                                  </span>
                                </button>
                                <button
                                  onClick={() => togglePick(p)}
                                  aria-pressed={mine}
                                  aria-label={
                                    mine
                                      ? `Remove ${p.name} from your team`
                                      : `Add ${p.name} to your team`
                                  }
                                  className={`icon-btn absolute right-1.5 top-1/2 h-10 w-10 -translate-y-1/2 ${mine ? "!text-gold" : ""}`}
                                >
                                  <IconStar size={19} filled={mine} />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            }
          />
        </div>

        <aside className="space-y-5">
          <section className="card overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line bg-gradient-to-r from-brand/15 to-transparent px-5 py-4">
              <BuzzerAvatar size={36} />
              <div>
                <p className="text-[15px] font-semibold leading-tight">
                  Buzzer on this match
                </p>
                <p className="text-[12.5px] text-muted">
                  Personal to you — private
                </p>
              </div>
            </div>
            <div className="space-y-4 p-5">
              {state?.onboarded ? (
                <NudgeCard surface="match" context={context} variant="inline" />
              ) : (
                <p className="text-[14px] text-muted">
                  Tell Buzzer what you follow and it&apos;ll point out what
                  matters to you here.
                </p>
              )}
              {suggestions.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Ask Buzzer</p>
                  <div className="flex flex-col gap-1.5">
                    {suggestions.slice(0, 3).map((s) => (
                      <button
                        key={s}
                        onClick={() => ask(s)}
                        disabled={busy}
                        className="rounded-[var(--r-md)] border border-line bg-surface-2 px-3.5 py-2.5 text-left text-[13.5px] transition-colors hover:border-brand/50 disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {m.hasClip && (
            <Link
              href={`/match/${m.id}/watch`}
              className="card card-interactive group relative block overflow-hidden"
            >
              {m.video && (
                <video
                  src={`${m.video}#t=20`}
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden
                  tabIndex={-1}
                  className="pointer-events-none aspect-video w-full object-cover opacity-70"
                />
              )}
              <div
                className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent"
                aria-hidden
              />
              <span className="brand-gradient absolute left-1/2 top-[38%] flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-xl transition-transform group-hover:scale-105">
                <IconPlay size={20} />
              </span>
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="text-[15px] font-semibold">Watch along</p>
                <p className="text-[12.5px] text-muted">
                  Match video · fan chat · your private Buzzer
                </p>
              </div>
            </Link>
          )}

          <Panel title="Match info">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[14px]">
              <dt className="text-muted">Competition</dt>
              <dd className="text-right font-medium">{m.competition}</dd>
              <dt className="text-muted">Sport</dt>
              <dd className="text-right font-medium">{sportLabel(m.sport)}</dd>
              {m.date && (
                <>
                  <dt className="text-muted">Date</dt>
                  <dd className="text-right font-medium">
                    {formatDate(m.date)}
                  </dd>
                </>
              )}
              {m.venue && (
                <>
                  <dt className="text-muted">Venue</dt>
                  <dd className="text-right font-medium">{m.venue}</dd>
                </>
              )}
            </dl>
          </Panel>
        </aside>
      </div>

      {sheet && <PlayerSheet player={sheet} onClose={() => setSheet(null)} />}
    </main>
  );
}
