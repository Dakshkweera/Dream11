"use client";

import { useEffect, useState } from "react";
import { browserSpeak } from "@/lib/client";
import { identityOf } from "@/lib/ui/identity";
import { useFriend, type Story } from "./friend-provider";
import { IconArrowRight, IconBook, IconGlobe, IconVolume, IconX } from "./ui/icons";
import { EntityAvatar } from "./ui/sport";

export function ListenButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");

  async function listen() {
    if (state !== "idle") return;
    setState("loading");
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("tts");
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => {
        setState("idle");
        URL.revokeObjectURL(url);
      };
      setState("playing");
      await audio.play();
    } catch {
      setState("idle");
      browserSpeak(text); // free fallback
    }
  }

  return (
    <button
      onClick={listen}
      className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2.5 py-1 text-[12px] font-medium text-muted transition-colors hover:text-fg"
      aria-label="Listen to this"
    >
      <IconVolume size={13} />
      {state === "playing" ? "Playing" : state === "loading" ? "Loading…" : "Listen"}
    </button>
  );
}

function Sources({ story }: { story: Story }) {
  return (
    <ul className="space-y-2">
      {story.sources.map((s) => (
        <li key={s.id} className="text-[12.5px] leading-relaxed text-muted">
          {s.text}{" "}
          <a href={s.url} target="_blank" rel="noreferrer" className="text-brand-2 underline underline-offset-2">
            source
          </a>
          {s.web ? (
            <span className="ml-1 inline-flex items-center gap-1 text-gold">
              · <IconGlobe size={11} /> found on the web just now
            </span>
          ) : (
            !s.verified && <span className="ml-1 text-gold">· awaiting human check</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Threads({ story, onPick }: { story: Story; onPick?: () => void }) {
  const { openStory, busy } = useFriend();
  if (!story.threads.length) return null;
  return (
    <div>
      <p className="eyebrow mb-2">Go deeper</p>
      <div className="flex flex-col gap-1.5">
        {story.threads.map((t) => (
          <button
            key={t.entityId}
            disabled={busy}
            onClick={() => {
              onPick?.();
              void openStory(t.entityId, { fromThread: true, angle: t.label });
            }}
            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-[13.5px] transition-colors hover:border-brand/60 disabled:opacity-50"
          >
            {t.label} <IconArrowRight size={15} className="shrink-0 text-brand-2" />
          </button>
        ))}
      </div>
    </div>
  );
}

/** A story inside the conversation. */
export function StoryCard({ story }: { story: Story }) {
  const [showSources, setShowSources] = useState(false);
  const who = identityOf(story.entityId);

  return (
    <div className="anim-fade-in overflow-hidden rounded-[var(--r-lg)] rounded-tl-md border border-line bg-surface-2">
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: `linear-gradient(100deg, ${who.primary}40, transparent 70%)` }}
      >
        <EntityAvatar id={story.entityId} size={34} />
        <p className="eyebrow inline-flex items-center gap-1.5 !text-fg/80">
          <IconBook size={12} /> Story{who.name ? ` · ${who.name}` : ""}
        </p>
      </div>
      <div className="p-4 pt-3">
        <h3 className="text-[18px] font-bold leading-snug">{story.title}</h3>
        <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-fg/90">{story.body}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ListenButton text={`${story.title}. ${story.body}`} />
          <button
            onClick={() => setShowSources((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-[12px] font-medium text-muted hover:text-fg"
            aria-expanded={showSources}
          >
            Sources ({story.sources.length})
          </button>
          {!story.grounded && <span className="text-[11px] text-gold">Facts only — kept it safe</span>}
        </div>

        {showSources && (
          <div className="mt-2.5 border-t border-line pt-2.5">
            <Sources story={story} />
          </div>
        )}

        {story.threads.length > 0 && (
          <div className="mt-4">
            <Threads story={story} />
          </div>
        )}
      </div>
    </div>
  );
}

/** A story as an editorial tile (Discover). */
export function StoryTile({ story, onOpen }: { story: Story; onOpen: () => void }) {
  const who = identityOf(story.entityId);
  return (
    <button onClick={onOpen} className="card card-interactive group flex h-full w-full flex-col overflow-hidden text-left">
      <div
        className="relative flex h-28 items-end overflow-hidden px-5 pb-4"
        style={{ background: `radial-gradient(130% 160% at 100% 0%, ${who.primary}d0 0%, ${who.primary}33 50%, transparent 80%), var(--surface-2)` }}
      >
        <div className="pitch-lines absolute inset-0 opacity-50" aria-hidden />
        <span aria-hidden className="pointer-events-none absolute -right-1 -top-3 select-none font-display text-[88px] font-extrabold uppercase leading-none text-white/[0.07]">
          {who.code}
        </span>
        <span className="relative flex items-center gap-2.5">
          <EntityAvatar id={story.entityId} size={36} />
          <span className="text-[12.5px] font-semibold text-fg/90">{who.name}</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="eyebrow inline-flex items-center gap-1.5 !text-brand-2">
          <IconBook size={12} /> Story
        </p>
        <h3 className="mt-1.5 text-[17px] font-bold leading-snug">{story.title}</h3>
        <p className="mt-2 line-clamp-3 text-[14px] leading-relaxed text-fg/70">{story.body}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[12px] text-muted">
          <span>
            {story.sources.length} source{story.sources.length === 1 ? "" : "s"}
            {story.grounded ? " · fact-checked" : ""}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-brand-2">
            Read <IconArrowRight size={14} />
          </span>
        </div>
      </div>
    </button>
  );
}

/** A full-page reader for one story. */
export function StoryReader({ story, onClose }: { story: Story; onClose: () => void }) {
  const who = identityOf(story.entityId);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[66] flex items-end justify-center bg-black/70 backdrop-blur-[2px] md:items-center md:p-6" onClick={onClose}>
      <article
        role="dialog"
        aria-label={story.title}
        onClick={(e) => e.stopPropagation()}
        className="sheet-anim thin-scroll max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] border border-line bg-bg-2 md:max-w-2xl md:rounded-[var(--r-xl)]"
      >
        <header
          className="relative overflow-hidden px-6 pb-6 pt-6 md:px-8 md:pt-8"
          style={{ background: `radial-gradient(120% 150% at 100% 0%, ${who.primary}cc 0%, ${who.primary}33 50%, transparent 80%), var(--surface)` }}
        >
          <div className="pitch-lines absolute inset-0 opacity-50" aria-hidden />
          <button onClick={onClose} className="icon-btn absolute right-4 top-4 h-10 w-10 bg-black/30 text-fg" aria-label="Close">
            <IconX size={18} />
          </button>
          <div className="relative flex items-center gap-3">
            <EntityAvatar id={story.entityId} size={44} />
            <p className="eyebrow !text-fg/85">Story · {who.name}</p>
          </div>
          <h2 className="relative mt-4 text-[26px] font-bold leading-tight md:text-[30px]">{story.title}</h2>
        </header>
        <div className="space-y-6 px-6 pb-8 pt-6 md:px-8">
          <p className="whitespace-pre-line text-[16.5px] leading-[1.75] text-fg/90">{story.body}</p>
          <div className="flex flex-wrap items-center gap-2">
            <ListenButton text={`${story.title}. ${story.body}`} />
            {!story.grounded && <span className="text-[12px] text-gold">Facts only — kept it safe</span>}
          </div>
          {story.sources.length > 0 && (
            <div className="rounded-[var(--r-md)] border border-line bg-surface p-4">
              <p className="eyebrow mb-2">Sources</p>
              <Sources story={story} />
            </div>
          )}
          <Threads story={story} onPick={onClose} />
        </div>
      </article>
    </div>
  );
}
