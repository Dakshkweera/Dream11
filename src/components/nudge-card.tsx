"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { PageContext } from "@/lib/friend/context";
import { useFriend } from "./friend-provider";

type Nudge = { entityId: string; entityName: string; hook: string; angle: string };

/**
 * A single, dismissible proactive suggestion. Refreshes when the user's profile
 * changes (epoch) and never appears twice per surface per session.
 */
export function NudgeCard({
  surface,
  context,
  focusEntity,
  compact,
}: {
  surface: "home" | "match" | "player";
  context: PageContext;
  focusEntity?: string;
  compact?: boolean;
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

  if (!result) {
    return <div className="h-24 animate-pulse rounded-2xl border border-line bg-surface" aria-hidden />;
  }
  const nudge = result.nudge;
  if (!nudge || dismissedKey === result.key) return null;

  return (
    <div className="anim-fade-in rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/15 to-surface p-4">
      <div className="flex items-start gap-3">
        <span className="brand-gradient mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm">🏏</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-2">Saathi noticed</p>
          <p className={`mt-1 leading-snug ${compact ? "text-[13px]" : "text-[15px]"}`}>{nudge.hook}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => {
                setCtx(context);
                openStory(nudge.entityId, { angle: nudge.angle });
              }}
              className="brand-gradient rounded-full px-4 py-1.5 text-[13px] font-semibold text-white"
            >
              Tell me
            </button>
            <button
              onClick={() => {
                api("/api/events", { type: "dismissed_nudge", entityId: nudge.entityId }).catch(() => {});
                setDismissedKey(result.key);
              }}
              className="rounded-full px-3 py-1.5 text-[13px] text-muted hover:text-fg"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
