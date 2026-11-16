"use client";

import { useEffect, useMemo } from "react";
import { api } from "@/lib/client";
import { identityOf, teamIdentity } from "@/lib/ui/identity";
import { useFriend } from "./friend-provider";
import { NudgeCard } from "./nudge-card";
import { IconBook, IconChat, IconX } from "./ui/icons";
import { EntityAvatar } from "./ui/sport";

export type SheetPlayer = { name: string; role?: string; entityId?: string; summary?: string };

/** A player's profile: a bottom sheet on phones, a centred dialog on larger screens. */
export function PlayerSheet({ player, onClose }: { player: SheetPlayer; onClose: () => void }) {
  const { setCtx, openStory, send, setOpen } = useFriend();
  const who = identityOf(player.entityId, player.name);
  const team = who.teamId ? teamIdentity(who.teamId) : null;
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

  const first = player.name.split(" ")[0];

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/65 backdrop-blur-[2px] md:items-center md:p-6" onClick={onClose}>
      <section
        role="dialog"
        aria-label={player.name}
        onClick={(e) => e.stopPropagation()}
        className="sheet-anim thin-scroll max-h-[88dvh] w-full overflow-y-auto rounded-t-[28px] border border-line bg-bg-2 md:max-w-lg md:rounded-[var(--r-xl)]"
      >
        <header
          className="relative overflow-hidden px-5 pb-5 pt-5"
          style={{ background: `radial-gradient(120% 150% at 100% 0%, ${who.primary}cc 0%, ${who.primary}2e 55%, transparent 85%), var(--surface)` }}
        >
          <div className="pitch-lines absolute inset-0 opacity-50" aria-hidden />
          <span aria-hidden className="pointer-events-none absolute -right-1 bottom-0 select-none font-display text-[96px] font-extrabold uppercase leading-none text-white/[0.07]">
            {team?.code ?? who.code}
          </span>
          <button onClick={onClose} aria-label="Close" className="icon-btn absolute right-3 top-3 h-10 w-10 bg-black/30 text-fg">
            <IconX size={18} />
          </button>
          <div className="relative flex items-center gap-4">
            <EntityAvatar id={player.entityId} name={player.name} size={68} />
            <div className="min-w-0">
              <p className="eyebrow !text-fg/75">{[player.role, team?.code].filter(Boolean).join(" · ") || "Player"}</p>
              <h2 className="mt-0.5 text-[24px] font-bold leading-tight">{player.name}</h2>
            </div>
          </div>
          {player.summary && <p className="relative mt-3 text-[14px] leading-relaxed text-fg/80">{player.summary}</p>}
        </header>

        <div className="space-y-3 p-5 pb-8">
          {player.entityId ? (
            <>
              <NudgeCard surface="player" context={context} focusEntity={player.entityId} />
              <button
                onClick={() => {
                  onClose();
                  void openStory(player.entityId!);
                }}
                className="btn-quiet h-12 w-full text-[15px]"
              >
                <IconBook size={17} /> Read {first}&apos;s story
              </button>
            </>
          ) : (
            <div className="rounded-[var(--r-md)] border border-line bg-surface p-4 text-[13px] leading-relaxed text-muted">
              I don&apos;t have verified facts on {player.name} yet, and I&apos;d rather say so than guess. I can still chat about the match or the
              teams.
            </div>
          )}

          <button
            onClick={() => {
              onClose();
              setOpen(true);
              void send(`Tell me about ${player.name}`);
            }}
            className="btn-primary h-12 w-full text-[15px]"
          >
            <IconChat size={17} /> Ask Buzzer about {first}
          </button>
        </div>
      </section>
    </div>
  );
}
