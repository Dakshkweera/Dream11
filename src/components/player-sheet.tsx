"use client";

import { useEffect, useMemo } from "react";
import { api } from "@/lib/client";
import { useFriend } from "./friend-provider";
import { NudgeCard } from "./nudge-card";

export type SheetPlayer = { name: string; role?: string; entityId?: string; summary?: string };

export function PlayerSheet({ player, onClose }: { player: SheetPlayer; onClose: () => void }) {
  const { setCtx, openStory, send, setOpen } = useFriend();
  const context = useMemo(
    () => ({
      surface: "player" as const,
      label: `${player.name} player page`,
      entityIds: player.entityId ? [player.entityId] : [],
    }),
    [player],
  );

  useEffect(() => {
    setCtx(context);
    if (player.entityId) api("/api/events", { type: "viewed_player", entityId: player.entityId }).catch(() => {});
  }, [context, player.entityId, setCtx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={onClose}>
      <section
        role="dialog"
        aria-label={`${player.name}`}
        onClick={(e) => e.stopPropagation()}
        className="anim-slide-up max-h-[85dvh] w-full max-w-[440px] overflow-y-auto rounded-t-3xl border border-line bg-bg p-4 pb-8"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            {player.role && <p className="text-[11px] uppercase tracking-widest text-muted">{player.role}</p>}
            <h2 className="text-xl font-bold">{player.name}</h2>
            {player.summary && <p className="mt-1 text-[13px] leading-relaxed text-muted">{player.summary}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:text-fg">
            ✕
          </button>
        </div>

        {player.entityId ? (
          <div className="space-y-3">
            <NudgeCard surface="player" context={context} focusEntity={player.entityId} compact />
            <button
              onClick={() => {
                onClose();
                openStory(player.entityId!);
              }}
              className="w-full rounded-xl border border-line bg-surface py-3 text-sm font-medium hover:border-brand"
            >
              Read {player.name.split(" ")[0]}&apos;s story
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-4 text-[13px] leading-relaxed text-muted">
            I don&apos;t have verified facts on {player.name} yet, and I&apos;d rather say so than guess. I can still chat about the
            match or the teams.
          </div>
        )}

        <button
          onClick={() => {
            onClose();
            setOpen(true);
            send(`Tell me about ${player.name}`);
          }}
          className="mt-3 w-full rounded-xl py-3 text-sm font-medium text-brand-2"
        >
          Ask Buzzer about {player.name.split(" ")[0]}
        </button>
      </section>
    </div>
  );
}
