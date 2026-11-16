/**
 * Shared sports building blocks: team crests, player avatars, status badges, section headers and match cards.
 * Server- and client-safe (no hooks).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { MatchSummary, TeamSide } from "@/lib/match/view";
import { identityOf, teamIdentity } from "@/lib/ui/identity";
import { IconArrowRight, IconChevronRight, IconPlay } from "./icons";

/* ------------------------------------------------------------------ identity */

/** A team's crest: its colours and code. (No team logos in the dataset, so no fake ones.) */
export function TeamCrest({ teamId, size = 44, className = "" }: { teamId: string; size?: number; className?: string }) {
  const t = teamIdentity(teamId);
  return (
    <span
      aria-hidden
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display font-bold text-white ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * (t.code.length > 3 ? 0.27 : 0.33)),
        background: `linear-gradient(140deg, ${t.primary} 0%, ${t.primary} 55%, ${t.secondary} 100%)`,
        boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.22), inset 0 -2px 6px rgb(0 0 0 / 0.25), 0 6px 16px -8px ${t.primary}`,
        textShadow: "0 1px 2px rgb(0 0 0 / 0.45)",
      }}
    >
      <span className="absolute inset-[3px] rounded-full border border-white/20" />
      <span className="relative tracking-wide">{t.code}</span>
    </span>
  );
}

/** A player (or any entity) as a round avatar with initials in their team's colours. */
export function EntityAvatar({ id, name, size = 44, className = "" }: { id?: string; name?: string; size?: number; className?: string }) {
  const who = identityOf(id, name);
  if (who.type === "team" && id) return <TeamCrest teamId={id} size={size} className={className} />;
  return (
    <span
      aria-hidden
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: `radial-gradient(circle at 30% 25%, ${who.primary}, ${who.secondary} 120%)`,
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.2)",
      }}
    >
      {who.initials}
      {who.teamId && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-bg px-1 font-sans text-[8.5px] font-bold leading-[14px] tracking-wide"
          style={{ background: teamIdentity(who.teamId).primary }}
        >
          {teamIdentity(who.teamId).code}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ labels */

export function StatusBadge({ status, hasClip }: { status: MatchSummary["status"]; hasClip?: boolean }) {
  if (status === "live")
    return (
      <span className="badge badge-live">
        <span className="anim-live h-1.5 w-1.5 rounded-full bg-live" /> Live
      </span>
    );
  if (status === "upcoming") return <span className="badge badge-upcoming">Upcoming</span>;
  return <span className={`badge ${hasClip ? "badge-replay" : "badge-done"}`}>{hasClip ? "Replay" : "Completed"}</span>;
}

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function SectionHeader({
  title,
  eyebrow,
  hint,
  href,
  action,
}: {
  title: string;
  eyebrow?: string;
  hint?: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1 !text-brand-2">{eyebrow}</p>}
        <h2 className="font-display text-[24px] font-bold uppercase leading-none tracking-wide md:text-[26px]">{title}</h2>
        {hint && <p className="mt-1.5 text-[14px] text-muted">{hint}</p>}
      </div>
      {href && (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[14px] font-semibold text-muted transition-colors hover:text-fg">
          {action ?? "See all"} <IconChevronRight size={16} />
        </Link>
      )}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center border-dashed px-6 py-10 text-center">
      <p className="text-[16px] font-semibold">{title}</p>
      {children && <div className="mt-1.5 max-w-md text-[14px] leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ match card */

function Side({ team, score, detail, align, won }: { team: TeamSide; score?: string; detail?: string; align: "left" | "right"; won?: boolean }) {
  const right = align === "right";
  return (
    <div className={`flex min-w-0 items-center gap-3 ${right ? "flex-row-reverse text-right" : ""}`}>
      <TeamCrest teamId={team.id} size={48} />
      <div className="min-w-0">
        <p className="font-display text-[22px] font-bold leading-none tracking-wide">{team.code}</p>
        <p className="mt-1 truncate text-[12px] text-muted">{team.short === team.code ? team.name : team.short}</p>
        {score && (
          <p className={`mt-1.5 font-display text-[20px] font-bold leading-none tabular-nums ${won === false ? "text-muted" : "text-fg"}`}>
            {score}
            {detail && <span className="ml-1 font-sans text-[11px] font-medium text-subtle">{detail}</span>}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * A fixture card in a broadcast style: competition and status on top, the two sides facing each other,
 * the result or venue underneath, and the actions. `featured` adds the match clip as a backdrop.
 */
export function MatchCard({ m, featured = false, className = "" }: { m: MatchSummary; featured?: boolean; className?: string }) {
  const video = m.video;
  const [a, b] = m.teams;
  const r = m.result;
  const date = formatDate(m.date);
  const tint = `linear-gradient(100deg, ${a.primary}2e 0%, transparent 42%, transparent 58%, ${b.primary}2e 100%)`;

  return (
    <article
      className={`card card-interactive group relative flex flex-col overflow-hidden ${featured ? "min-h-[260px]" : ""} ${className}`}
      style={{ backgroundImage: tint }}
    >
      {featured && video && (
        <>
          <video
            src={`${video}#t=14`}
            muted
            playsInline
            preload="metadata"
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/75 to-bg/30" aria-hidden />
        </>
      )}
      <Link href={`/match/${m.id}`} className="absolute inset-0 z-[1]" aria-label={`${a.name} vs ${b.name} — match centre`} />

      <div className="relative flex items-center justify-between gap-3 px-4 pt-4 md:px-5">
        <p className="truncate text-[12.5px] font-semibold text-muted">{m.competition}</p>
        <StatusBadge status={m.status} hasClip={m.hasClip} />
      </div>

      <div className={`relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 md:px-5 ${featured ? "flex-1 py-6" : "py-5"}`}>
        <Side team={a} score={r?.scores[a.id]} detail={r?.detail?.[a.id]} align="left" won={r?.winner ? r.winner === a.id : undefined} />
        <div className="flex flex-col items-center px-1 text-center">
          <span className="font-display text-[13px] font-bold uppercase tracking-widest text-subtle">vs</span>
          {date && <span className="mt-1 whitespace-nowrap text-[11px] text-subtle">{date}</span>}
        </div>
        <Side team={b} score={r?.scores[b.id]} detail={r?.detail?.[b.id]} align="right" won={r?.winner ? r.winner === b.id : undefined} />
      </div>

      <div className="relative mt-auto flex items-center justify-between gap-3 border-t border-line/80 bg-black/15 px-4 py-3 md:px-5">
        <p className={`min-w-0 truncate text-[13px] ${r ? "font-semibold text-good" : "text-muted"}`}>
          {r?.summary ?? m.venue ?? "Fixture to be confirmed"}
        </p>
        {m.hasClip ? (
          <Link
            href={`/match/${m.id}/watch`}
            className="btn-primary relative z-[2] h-9 shrink-0 px-4 text-[13px]"
            aria-label={`Watch along: ${a.short} vs ${b.short}`}
          >
            <IconPlay size={13} /> Watch along
          </Link>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-muted transition-colors group-hover:text-fg">
            Match centre <IconArrowRight size={15} />
          </span>
        )}
      </div>
    </article>
  );
}
