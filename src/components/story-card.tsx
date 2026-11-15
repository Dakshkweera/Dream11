"use client";

import { useState } from "react";
import { browserSpeak } from "@/lib/client";
import { useFriend, type Story } from "./friend-provider";

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
      className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:text-fg"
      aria-label="Listen to this"
    >
      <span aria-hidden>{state === "playing" ? "🔊" : state === "loading" ? "…" : "🔈"}</span>
      {state === "playing" ? "Playing" : state === "loading" ? "Loading" : "Listen"}
    </button>
  );
}

export function StoryCard({ story }: { story: Story }) {
  const { openStory, busy } = useFriend();
  const [showSources, setShowSources] = useState(false);

  return (
    <div className="anim-fade-in rounded-2xl border border-line bg-surface-2 p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-2">Story</p>
      <h3 className="mt-0.5 text-[15px] font-semibold leading-snug">{story.title}</h3>
      <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-fg/90">{story.body}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ListenButton text={`${story.title}. ${story.body}`} />
        <button
          onClick={() => setShowSources((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:text-fg"
          aria-expanded={showSources}
        >
          <span aria-hidden>📎</span> Sources ({story.sources.length})
        </button>
        {!story.grounded && <span className="text-[11px] text-gold">Facts only — kept it safe</span>}
      </div>

      {showSources && (
        <ul className="mt-2.5 space-y-2 border-t border-line pt-2.5">
          {story.sources.map((s) => (
            <li key={s.id} className="text-xs leading-relaxed text-muted">
              {s.text}{" "}
              <a href={s.url} target="_blank" rel="noreferrer" className="text-brand-2 underline underline-offset-2">
                source
              </a>
              {s.web ? (
                <span className="ml-1 text-gold">· 🌐 found on the web just now</span>
              ) : (
                !s.verified && <span className="ml-1 text-gold">· awaiting human check</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {story.threads.length > 0 && (
        <div className="mt-3.5">
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">Go deeper</p>
          <div className="flex flex-col gap-1.5">
            {story.threads.map((t) => (
              <button
                key={t.entityId}
                disabled={busy}
                onClick={() => openStory(t.entityId, { fromThread: true, angle: t.label })}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-left text-[13px] hover:border-brand disabled:opacity-50"
              >
                {t.label} <span className="text-brand-2">→</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
