"use client";

import { useEffect, useRef, useState } from "react";
import { api, recorderMime, speakAloud, stopSpeaking } from "@/lib/client";
import { useFriend } from "./friend-provider";
import { ListenButton, StoryCard } from "./story-card";

type Chip = { label: string; value: string };
type Sport = { id: string; label: string; emoji: string; follow: Chip[] };
type Level = "new" | "casual" | "regular" | "expert";
type Answer = { level: Level; follows: string[] };

const LEVELS: { id: Level; label: string }[] = [
  { id: "new", label: "Totally new" },
  { id: "casual", label: "Casual — I know the basics" },
  { id: "regular", label: "I follow regularly" },
  { id: "expert", label: "I know it well" },
];

const pill = (on: boolean) => `rounded-full border px-3 py-1.5 text-[13px] ${on ? "border-brand bg-brand/15 text-fg" : "border-line text-muted"}`;
const input = "min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-brand";

/**
 * Three small questions, in the order a friend would ask them: which sports, how well do you know each,
 * who do you follow in it. Everything offered comes from the dataset; anything else can be typed.
 */
function Onboarding() {
  const { refreshState, say, setOpen } = useFriend();
  const [sports, setSports] = useState<Sport[]>([]);
  const [picked, setPicked] = useState<string[]>([]); // sport ids
  const [other, setOther] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [typed, setTyped] = useState("");
  const [step, setStep] = useState(0); // 0 = which sports, 1.. = one screen per picked sport
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ sports: Sport[] }>("/api/catalog")
      .then((r) => setSports(r.sports))
      .catch(() => {});
  }, []);

  const current = step > 0 ? sports.find((s) => s.id === picked[step - 1]) : undefined;
  const answer = (id: string): Answer => answers[id] ?? { level: "casual", follows: [] };
  // Updates read the latest state, so two quick taps never overwrite each other.
  const patch = (id: string, p: Partial<Answer> | ((a: Answer) => Partial<Answer>)) =>
    setAnswers((all) => {
      const a = all[id] ?? { level: "casual" as Level, follows: [] };
      return { ...all, [id]: { ...a, ...(typeof p === "function" ? p(a) : p) } };
    });

  const addOther = () => {
    const v = otherText.trim();
    if (v && other.length < 4 && !other.includes(v)) setOther([...other, v]);
    setOtherText("");
  };
  const addTyped = (id: string) => {
    const v = typed.trim();
    if (v) patch(id, (a) => (a.follows.length < 8 && !a.follows.includes(v) ? { follows: [...a.follows, v] } : {}));
    setTyped("");
  };

  async function finish() {
    setSaving(true);
    setErr("");
    try {
      const pending = otherText.trim();
      await api("/api/onboard", {
        sports: picked.map((id) => ({ sport: id, ...answer(id) })),
        other: pending && !other.includes(pending) ? [...other, pending] : other,
      });
      await refreshState();
      say("Great — I'll remember that. Ask me anything, or keep an eye on the home screen: I'll bring up things I think you'll like.");
      setOpen(false); // land on the home screen, where the first proactive nudge appears
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  const lastStep = step >= picked.length;
  const nothing = picked.length === 0 && other.length === 0 && !otherText.trim();
  const people = current
    ? [...current.follow, ...answer(current.id).follows.filter((f) => !current.follow.some((c) => c.value === f)).map((f) => ({ label: f, value: f }))]
    : [];

  return (
    <div className="anim-fade-in space-y-4 p-4">
      <div className="rounded-2xl border border-line bg-surface-2 p-4">
        <p className="text-sm font-semibold">Hey, I&apos;m Buzzer 👋</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          {step === 0
            ? "I'm the friend who's watched a lot of sport and loves telling the stories behind it. First — which sports are you into?"
            : `${current?.emoji ?? ""} ${current?.label ?? "This sport"} — tell me how well you know it and who you follow, so I don't bore you or lose you.`}
        </p>
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {sports.map((s) => {
              const on = picked.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                  aria-pressed={on}
                  className={`${pill(on)} px-4 py-2 text-sm`}
                >
                  {s.emoji} {s.label}
                </button>
              );
            })}
            {other.map((o) => (
              <button key={o} onClick={() => setOther(other.filter((x) => x !== o))} aria-label={`Remove ${o}`} className={`${pill(true)} px-4 py-2 text-sm`}>
                🏅 {o} ✕
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addOther();
            }}
            className="flex gap-2"
          >
            <input value={otherText} onChange={(e) => setOtherText(e.target.value)} placeholder="Another sport? Type it (football, tennis…)" maxLength={40} className={input} />
            <button type="submit" className="rounded-xl border border-line px-3 text-[13px] text-muted">
              Add
            </button>
          </form>
        </div>
      )}

      {current && (
        <>
          <div>
            <p className="mb-2 text-sm font-medium">How well do you know {current.label.toLowerCase()}?</p>
            <div className="flex flex-col gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => patch(current.id, { level: l.id })}
                  aria-pressed={answer(current.id).level === l.id}
                  className={`rounded-xl border px-3 py-2 text-left text-[13px] ${answer(current.id).level === l.id ? "border-brand bg-brand/15" : "border-line text-muted"}`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">
              Who do you follow? <span className="font-normal text-muted">(optional)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {people.map((c) => {
                const on = answer(current.id).follows.includes(c.value);
                return (
                  <button
                    key={c.value}
                    onClick={() => patch(current.id, (a) => ({ follows: a.follows.includes(c.value) ? a.follows.filter((x) => x !== c.value) : [...a.follows, c.value] }))}
                    aria-pressed={on}
                    className={pill(on)}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addTyped(current.id);
              }}
              className="mt-2 flex gap-2"
            >
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Someone not listed? Type a name" maxLength={60} className={input} />
              <button type="submit" className="rounded-xl border border-line px-3 text-[13px] text-muted">
                Add
              </button>
            </form>
          </div>
        </>
      )}

      {err && <p className="text-xs text-brand-2">{err}</p>}
      <div className="flex gap-2">
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} className="rounded-xl border border-line px-4 py-3 text-sm text-muted">
            Back
          </button>
        )}
        <button
          onClick={() => (lastStep ? finish() : setStep(step + 1))}
          disabled={saving}
          className="brand-gradient flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : nothing && step === 0 ? "Skip — I'll figure it out as we chat" : lastStep ? "Let's go" : "Next"}
        </button>
      </div>
    </div>
  );
}


type Mic = "idle" | "recording" | "transcribing";

/** Tap to start talking, tap again to stop (it also stops by itself after 30 s). The words go to the speech model. */
function useVoiceInput(onText: (t: string) => void, onProblem: (m: string) => void) {
  const [mic, setMic] = useState<Mic>("idle");
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  };

  async function start() {
    stopSpeaking(); // don't talk over the fan
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onProblem("I can't hear you — allow the microphone for this site and try again.");
      return;
    }
    const mime = recorderMime();
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: r.mimeType || mime || "audio/webm" });
      if (blob.size < 2000) {
        setMic("idle");
        onProblem("I didn't catch anything — tap the mic and try again.");
        return;
      }
      setMic("transcribing");
      try {
        const form = new FormData();
        form.append("audio", blob, "speech");
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const data = (await res.json()) as { text?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? "failed");
        if (data.text?.trim()) onText(data.text.trim());
        else onProblem("I didn't catch that — try again a bit closer to the mic.");
      } catch {
        onProblem("Couldn't turn that into text just now. You can type it instead.");
      }
      setMic("idle");
    };
    rec.current = r;
    r.start();
    setMic("recording");
    timer.current = setTimeout(stop, 30_000);
  }

  return { mic, supported, toggle: () => (mic === "recording" ? stop() : mic === "idle" ? start() : undefined) };
}

export function FriendPanel() {
  const { open, setOpen, messages, busy, send, state, toast, ctx, epoch } = useFriend();
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const ctxKey = JSON.stringify({ s: ctx.surface, l: ctx.label, e: ctx.entityIds });
  const endRef = useRef<HTMLDivElement>(null);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [micNote, setMicNote] = useState("");
  const spoken = useRef<string | null>(null);

  // Talking to the friend switches on spoken replies, so it feels like a conversation.
  const voice = useVoiceInput(
    (t) => {
      setMicNote("");
      setVoiceReplies(true);
      if (!busy) send(t);
    },
    setMicNote,
  );

  // Read each new reply aloud once it has finished arriving.
  useEffect(() => {
    if (!voiceReplies || busy) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || last.pending || spoken.current === last.id) return;
    spoken.current = last.id;
    const line = last.story ? `${last.story.title}. ${last.story.body}` : last.text;
    if (line.trim()) void speakAloud(line);
  }, [messages, busy, voiceReplies]);

  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  // Suggestion chips come from the fan's memory and the current page, not a fixed list.
  useEffect(() => {
    if (!open || !state) return;
    let cancelled = false;
    api<{ suggestions: string[] }>("/api/suggestions", { context: ctx })
      .then((r) => !cancelled && setSuggestions(r.suggestions))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, epoch, ctxKey, state?.onboarded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  function submit(t: string) {
    const v = t.trim();
    if (!v || busy) return;
    setText("");
    send(v);
  }

  return (
    <>
      {toast && !open && (
        <div
          role="status"
          className="anim-fade-in fixed bottom-24 left-1/2 z-40 w-[min(360px,calc(100vw-32px))] -translate-x-1/2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-center text-xs text-fg shadow-xl"
        >
          🧠 {toast}
        </div>
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Buzzer, your sports friend"
          className="brand-gradient fixed bottom-20 right-[max(16px,calc(50vw-204px))] z-30 flex h-14 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white shadow-lg shadow-brand/30"
        >
          <span aria-hidden className="text-lg">💬</span> Buzzer
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setOpen(false)}>
          <section
            role="dialog"
            aria-label="Buzzer, your sports friend"
            onClick={(e) => e.stopPropagation()}
            className="anim-slide-up flex h-[88dvh] w-full max-w-[440px] flex-col rounded-t-3xl border border-line bg-bg"
          >
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="brand-gradient flex h-8 w-8 items-center justify-center rounded-full text-sm">🏅</span>
                <div>
                  <p className="text-sm font-semibold leading-none">Buzzer</p>
                  <p className="mt-1 text-[11px] leading-none text-muted">
                    {state?.onboarded ? `Your sports friend · ${state.level} level` : "Your sports friend"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    if (voiceReplies) stopSpeaking();
                    setVoiceReplies((v) => !v);
                  }}
                  aria-pressed={voiceReplies}
                  aria-label="Spoken replies"
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${voiceReplies ? "border-brand bg-brand/15 text-fg" : "border-line text-muted"}`}
                >
                  {voiceReplies ? "🔊 Voice on" : "🔈 Voice off"}
                </button>
                <button onClick={() => setOpen(false)} className="rounded-full p-2 text-muted hover:text-fg" aria-label="Close">
                  ✕
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto">
              {state && !state.onboarded && messages.length === 0 ? (
                <Onboarding />
              ) : (
                <div className="space-y-3 p-4">
                  {messages.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted">Ask me anything about sport — or just say hi. Tap the mic to talk.</p>
                  )}
                  {messages.map((m) => (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[92%] ${m.role === "user" ? "" : "w-full"}`}>
                        {m.kind === "live" && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gold">Live · from the match</p>}
                        {m.kind === "moment" && m.role === "assistant" && (
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-brand-2">What just happened</p>
                        )}
                        {m.pending ? (
                          <div className="inline-flex items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3" aria-label={m.label ?? "Buzzer is thinking"}>
                            <span className="inline-flex gap-1">
                              <span className="dot h-1.5 w-1.5 rounded-full bg-muted" />
                              <span className="dot h-1.5 w-1.5 rounded-full bg-muted" />
                              <span className="dot h-1.5 w-1.5 rounded-full bg-muted" />
                            </span>
                            {m.label && <span className="text-[12px] text-muted">{m.label}</span>}
                          </div>
                        ) : m.story ? (
                          <StoryCard story={m.story} />
                        ) : (
                          <div
                            className={`rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
                              m.role === "user" ? "brand-gradient text-white" : "bg-surface-2"
                            }`}
                          >
                            <span className="whitespace-pre-line">{m.text}</span>
                            {m.role === "assistant" && m.text.length > 40 && (
                              <div className="mt-2">
                                <ListenButton text={m.text} />
                              </div>
                            )}
                          </div>
                        )}
                        {!!m.sources?.length && (
                          <div className="mt-1.5 rounded-xl border border-line bg-surface px-3 py-2">
                            <p className="text-[11px] text-muted">🌐 From the web — not from my verified IPL fact sheet</p>
                            <ul className="mt-1 space-y-0.5">
                              {m.sources.map((s) => (
                                <li key={s.url} className="truncate text-[12px]">
                                  <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-brand-2 underline underline-offset-2">
                                    {s.title}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {m.notes?.map((n) => (
                          <p key={n} className="mt-1.5 text-[11px] text-good">
                            🧠 {n}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            {(!state || state.onboarded || messages.length > 0) && (
              <footer className="border-t border-line p-3">
                {messages.length < 3 && suggestions.length > 0 && (
                  <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => submit(s)}
                        disabled={busy}
                        className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:text-fg disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {(voice.mic !== "idle" || micNote) && (
                  <p role="status" className="mb-2 text-center text-[12px] text-muted">
                    {voice.mic === "recording" ? "🎙️ Listening… tap ⏹ when you're done" : voice.mic === "transcribing" ? "Turning your voice into text…" : micNote}
                  </p>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit(text);
                  }}
                  className="flex gap-2"
                >
                  {voice.supported && (
                    <button
                      type="button"
                      onClick={voice.toggle}
                      disabled={voice.mic === "transcribing" || (busy && voice.mic === "idle")}
                      aria-label={voice.mic === "recording" ? "Stop and send" : "Talk to Buzzer"}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-base disabled:opacity-40 ${
                        voice.mic === "recording" ? "animate-pulse border-brand bg-brand text-white" : "border-line text-muted hover:text-fg"
                      }`}
                    >
                      {voice.mic === "recording" ? "⏹" : voice.mic === "transcribing" ? "…" : "🎙️"}
                    </button>
                  )}
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Ask Buzzer anything…"
                    aria-label="Message Buzzer"
                    maxLength={1500}
                    className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-sm placeholder:text-muted"
                  />
                  <button
                    type="submit"
                    disabled={busy || !text.trim()}
                    className="brand-gradient rounded-full px-4 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Send
                  </button>
                </form>
              </footer>
            )}
          </section>
        </div>
      )}
    </>
  );
}
