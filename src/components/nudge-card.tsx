"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { PageContext } from "@/lib/friend/context";
import { identityOf, sportLabel } from "@/lib/ui/identity";
import { BuzzerAvatar } from "./buzzer-avatar";
import { useFriend } from "./friend-provider";
import { IconArrowRight, IconBook, IconSparkles } from "./ui/icons";
import { EntityAvatar } from "./ui/sport";

type Nudge = { entityId: string; entityName: string; hook: string; angle: string };

/**
 * A single, dismissible thing Buzzer wants to tell you. Refreshes when the user's profile changes (epoch)
 * and never appears twice per surface per session.
 * - `spotlight`: the big editorial card on the home screen.
 * - `card`: a compact card (player sheet).
 * - `inline`: plain content for inside another panel (match centre).
 */
export function NudgeCard({
  surface,
  context,
  focusEntity,
  variant = "card",
}: {
  surface: "home" | "match" | "player";
  context: PageContext;
  focusEntity?: string;
  variant?: "spotlight" | "card" | "inline";
}) {
  const { epoch, sessionId, state, openStory, setCtx } = useFriend();
  const [result, setResult] = useState<{ key: string; nudge: Nudge | null } | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const ctxKey = JSON.stringify(context);
  const ready = !!state && sessionId !== "s_init";
  const reqKey = `${surface}|${sessionId}|${epoch}|${focusEntity ?? ""}|${ctxKey}`;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    // epoch: refetch after the profile changes; the server rate-limits so it's safe.
    api<{ nudge: Nudge | null }>("/api/nudge", { surface, sessionId, context: JSON.parse(ctxKey), focusEntity })
      .then((r) => !cancelled && setResult({ key: reqKey, nudge: r.nudge }))
      .catch(() => !cancelled && setResult({ key: reqKey, nudge: null }));
    return () => {
      cancelled = true;
    };
  }, [ready, surface, sessionId, focusEntity, ctxKey, reqKey]);

  const spotlight = variant === "spotlight";
  if (!result) {
    return <div className={`skeleton ${spotlight ? "h-full min-h-[280px]" : variant === "inline" ? "h-28" : "h-24"}`} aria-label="Loading" />;
  }
  const nudge = result.nudge;
  const dismissed = dismissedKey === result.key;

  if (!nudge || dismissed) {
    if (!spotlight) return null;
    return (
      <div className="card flex h-full min-h-[240px] flex-col justify-between p-6">
        <div>
          <p className="eyebrow inline-flex items-center gap-1.5 !text-brand-2">
            <IconSparkles size={13} /> Buzzer noticed
          </p>
          <p className="mt-3 text-[19px] font-semibold leading-snug">
            {dismissed ? "Got it — I'll find you something better." : "Nothing new to flag right now."}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            The more you ask and read, the better I get at spotting stories you&apos;ll care about.
          </p>
        </div>
        <Link href="/discover" className="btn-quiet mt-6 h-11 self-start px-5 text-[14px]">
          Explore Discover <IconArrowRight size={16} />
        </Link>
      </div>
    );
  }

  const who = identityOf(nudge.entityId, nudge.entityName);
  const tell = () => {
    setCtx(context);
    void openStory(nudge.entityId, { angle: nudge.angle });
  };
  const notNow = () => {
    api("/api/events", { type: "dismissed_nudge", entityId: nudge.entityId }).catch(() => {});
    setDismissedKey(result.key);
  };

  if (variant === "inline") {
    return (
      <div className="anim-fade-in">
        <p className="eyebrow inline-flex items-center gap-1.5 !text-brand-2">
          <IconSparkles size={13} /> Buzzer noticed
        </p>
        <p className="mt-1.5 text-[15px] leading-snug">{nudge.hook}</p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={tell} className="btn-primary h-10 px-5 text-[14px]">
            Tell me
          </button>
          <button onClick={notNow} className="btn-ghost h-10 px-4 text-[14px]">
            Not now
          </button>
        </div>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className="anim-fade-in rounded-[var(--r-lg)] border border-brand/30 bg-gradient-to-br from-brand/15 via-surface to-surface p-4">
        <div className="flex items-center gap-2.5">
          <BuzzerAvatar size={30} />
          <p className="text-[13px] text-muted">Buzzer noticed something for you</p>
        </div>
        <p className="mt-3 text-[16px] font-semibold leading-snug">{nudge.hook}</p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={tell} className="btn-primary h-10 px-5 text-[14px]">
            Tell me
          </button>
          <button onClick={notNow} className="btn-ghost h-10 px-4 text-[14px]">
            Not now
          </button>
        </div>
      </div>
    );
  }

  // spotlight
  return (
    <article className="anim-fade-in card relative flex h-full min-h-[280px] flex-col overflow-hidden">
      <div
        className="relative flex h-36 items-end px-6 pb-0"
        style={{ background: `radial-gradient(120% 140% at 85% 0%, ${who.primary}cc 0%, ${who.primary}33 45%, transparent 75%), linear-gradient(180deg, var(--surface-2), var(--surface))` }}
      >
        {/* decoration is clipped to the band; the avatar overlaps the band's bottom edge */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="pitch-lines absolute inset-0 opacity-60" />
          <span className="absolute -right-2 -top-6 select-none font-display text-[120px] font-extrabold uppercase leading-none text-white/[0.06]">
            {who.code}
          </span>
        </div>
        <EntityAvatar id={nudge.entityId} name={nudge.entityName} size={76} className="relative translate-y-1/2 ring-4 ring-surface" />
      </div>
      <div className="flex flex-1 flex-col px-6 pb-6 pt-12">
        <p className="eyebrow inline-flex items-center gap-1.5 !text-brand-2">
          <IconSparkles size={13} /> Buzzer noticed · {nudge.entityName}
        </p>
        <h3 className="mt-2 text-[21px] font-bold leading-snug md:text-[22px]">{nudge.hook}</h3>
        <p className="mt-2 text-[13px] text-subtle">Picked for you from what you follow{who.sport ? ` in ${sportLabel(who.sport).toLowerCase()}` : ""}.</p>
        <div className="flex-1" />
        <div className="mt-5 flex items-center gap-2">
          <button onClick={tell} className="btn-primary h-11 px-5 text-[14px]">
            <IconBook size={16} /> Tell me the story
          </button>
          <button onClick={notNow} className="btn-ghost h-11 px-4 text-[14px]">
            Not now
          </button>
        </div>
      </div>
    </article>
  );
}
