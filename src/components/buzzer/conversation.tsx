"use client";

/**
 * Buzzer's private conversation: the message list, suggestion chips and the composer (text + mic). Rendered by
 * the floating drawer and by the watch-along's "My Buzzer" panel — both show the same conversation from
 * FriendProvider and the same voice from VoiceProvider, never a copy.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { BuzzerAvatar } from "../buzzer-avatar";
import { useFriend, type Msg } from "../friend-provider";
import { ListenButton, StoryCard } from "../story-card";
import { IconBrain, IconEye, IconGlobe, IconMic, IconMicOff, IconSend, IconZap } from "../ui/icons";
import { useVoice } from "../voice/voice-provider";
import { PHASE_LABEL, PhasePill, VoiceWave } from "../voice/voice-visuals";

/** Suggestion chips from the fan's memory and the current page (no AI call). */
export function useSuggestions(enabled: boolean): string[] {
  const { state, ctx, epoch } = useFriend();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const ctxKey = JSON.stringify({ s: ctx.surface, l: ctx.label, e: ctx.entityIds });
  useEffect(() => {
    if (!enabled || !state) return;
    let cancelled = false;
    api<{ suggestions: string[] }>("/api/suggestions", { context: ctx })
      .then((r) => !cancelled && setSuggestions(r.suggestions))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, epoch, ctxKey, state?.onboarded]); // eslint-disable-line react-hooks/exhaustive-deps
  return suggestions;
}

function Thinking({ label }: { label?: string }) {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-2xl rounded-tl-md bg-surface-2 px-4 py-3" aria-label={label ?? "Buzzer is thinking"}>
      <span className="inline-flex gap-1">
        <span className="dot h-1.5 w-1.5 rounded-full bg-muted" />
        <span className="dot h-1.5 w-1.5 rounded-full bg-muted" />
        <span className="dot h-1.5 w-1.5 rounded-full bg-muted" />
      </span>
      {label && <span className="text-[13px] text-muted">{label}</span>}
    </div>
  );
}

function Message({ m, voiceOn }: { m: Msg; voiceOn: boolean }) {
  if (m.role === "user") {
    return (
      <div className="anim-fade-in flex justify-end">
        <div className="max-w-[85%]">
          {m.kind === "moment" && <p className="eyebrow mb-1 text-right">Asked about this moment</p>}
          <div className="brand-gradient rounded-2xl rounded-tr-md px-4 py-2.5 text-[15px] leading-relaxed text-white">
            <span className="whitespace-pre-line">{m.text}</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="anim-fade-in flex gap-2.5">
      <BuzzerAvatar size={28} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {m.kind === "live" && (
          <p className="eyebrow mb-1 inline-flex items-center gap-1 !text-gold">
            <IconZap size={12} /> From the match
          </p>
        )}
        {m.kind === "moment" && (
          <p className="eyebrow mb-1 inline-flex items-center gap-1 !text-brand-2">
            <IconEye size={12} /> What just happened
          </p>
        )}
        {m.pending ? (
          <Thinking label={m.label} />
        ) : m.story ? (
          <StoryCard story={m.story} />
        ) : (
          <div className="inline-block max-w-full rounded-2xl rounded-tl-md bg-surface-2 px-4 py-2.5 text-[15px] leading-relaxed">
            <span className="whitespace-pre-line">{m.text}</span>
            {m.streaming && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-brand-2" aria-hidden />}
            {m.interrupted && <span className="ml-1 text-[12px] text-muted">— you cut in</span>}
            {!m.streaming && m.text.length > 40 && !voiceOn && (
              <div className="mt-2">
                <ListenButton text={m.text} />
              </div>
            )}
          </div>
        )}
        {!!m.sources?.length && (
          <div className="mt-2 rounded-2xl border border-line bg-surface px-3.5 py-2.5">
            <p className="inline-flex items-center gap-1.5 text-[12px] text-muted">
              <IconGlobe size={13} /> From the web, not my checked facts
            </p>
            <ul className="mt-1 space-y-0.5">
              {m.sources.map((s) => (
                <li key={s.url} className="truncate text-[13px]">
                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-brand-2 underline underline-offset-2">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {m.notes?.map((n) => (
          <p key={n} className="mt-1.5 inline-flex items-start gap-1.5 text-[12px] text-good">
            <IconBrain size={13} className="mt-0.5 shrink-0" /> {n}
          </p>
        ))}
      </div>
    </div>
  );
}

/** The scrolling list of messages, with the right empty / first-run state. */
export function ConversationMessages({ emptyHint, onNavigate }: { emptyHint?: string; onNavigate?: () => void }) {
  const { messages, state } = useFriend();
  const voice = useVoice();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (state && !state.onboarded && messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <BuzzerAvatar size={64} />
        <p className="text-[20px] font-bold">Let&apos;s get to know each other</p>
        <p className="max-w-xs text-muted">Three quick questions, and I&apos;ll know which stories you&apos;ll love.</p>
        <Link href="/welcome" onClick={onNavigate} className="btn-primary h-12 px-8">
          Get started
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4" aria-live="polite">
      {messages.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <BuzzerAvatar size={52} />
          <p className="text-[17px] font-semibold">What do you want to know?</p>
          <p className="max-w-xs text-[14px] text-muted">{emptyHint ?? "Ask anything about sport, or tap the mic and just talk."}</p>
        </div>
      )}
      {messages.map((m) => (
        <Message key={m.id} m={m} voiceOn={voice.active} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

/** Live voice controls inside a conversation: waveform, state, what was heard, mute and end. */
export function VoiceBar({ compact }: { compact?: boolean }) {
  const v = useVoice();
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <button
          onClick={() => v.setMuted(!v.muted)}
          aria-pressed={v.muted}
          aria-label={v.muted ? "Unmute microphone" : "Mute microphone"}
          className={`icon-btn h-11 w-11 border ${v.muted ? "border-brand bg-brand/10 text-fg" : "border-line-strong bg-surface-2 text-fg"}`}
        >
          {v.muted ? <IconMicOff size={19} /> : <IconMic size={19} />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <VoiceWave phase={v.phase} level={v.level} muted={v.muted} bars={compact ? 22 : 30} height={compact ? 26 : 32} />
          <PhasePill phase={v.phase} muted={v.muted} />
        </div>
        <button onClick={v.stop} aria-label="End voice conversation" className="btn-quiet h-11 px-4 text-[14px]">
          End
        </button>
      </div>
      {v.heard && (v.phase === "hearing" || v.phase === "transcribing" || v.phase === "thinking") ? (
        <p className="line-clamp-2 text-center text-[14px] italic text-fg/85">“{v.heard}”</p>
      ) : (
        !compact && <p className="text-center text-[12px] text-muted">{v.muted ? "Mic muted — unmute to talk" : PHASE_LABEL[v.phase]}</p>
      )}
    </div>
  );
}

/** Text box + send, or the mic. Switches to the voice bar while a voice conversation is on. */
export function Composer({
  placeholder = "Ask Buzzer anything…",
  suggestions = [],
  compact,
  note,
}: {
  placeholder?: string;
  suggestions?: string[];
  compact?: boolean;
  /** Small print under the box (e.g. "Private — only you see this"). */
  note?: React.ReactNode;
}) {
  const { busy, send, messages } = useFriend();
  const voice = useVoice();
  const [text, setText] = useState("");

  function submit(t: string) {
    const v = t.trim();
    if (!v || busy) return;
    setText("");
    voice.speaker.stop();
    void send(v);
  }

  if (voice.active) return <VoiceBar compact={compact} />;

  return (
    <div>
      {messages.length < 3 && suggestions.length > 0 && (
        <div className="scroller -mx-3 mb-2.5 px-3 pb-0.5">
          {suggestions.map((s) => (
            <button key={s} onClick={() => submit(s)} disabled={busy} className="chip shrink-0 !py-1.5 text-[13px] disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
      )}
      {voice.error && (
        <p role="status" className="mb-2 text-center text-[13px] text-brand-2">
          {voice.error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label="Message Buzzer"
          maxLength={1500}
          className="field"
        />
        {text.trim() ? (
          <button type="submit" disabled={busy} aria-label="Send" className="btn-primary h-11 w-11 shrink-0 !p-0">
            <IconSend size={19} />
          </button>
        ) : (
          voice.supported && (
            <button
              type="button"
              onClick={() => void voice.start()}
              disabled={voice.phase === "starting"}
              aria-label="Talk to Buzzer"
              title="Talk to Buzzer, hands-free"
              className="btn-primary h-11 w-11 shrink-0 !p-0"
            >
              <IconMic size={19} />
            </button>
          )
        )}
      </form>
      {note && <p className="mt-2 text-center text-[11.5px] text-subtle">{note}</p>}
    </div>
  );
}
