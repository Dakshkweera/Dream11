"use client";

/**
 * The home screen's hero: talking to Buzzer is the first thing you see. It drives the app's one voice
 * conversation (VoiceProvider) and shows it live — what Buzzer heard, what it's doing, and its answer as text.
 */
import Link from "next/link";
import { useFriend } from "../friend-provider";
import { IconBrain, IconChat, IconMic, IconMicOff } from "../ui/icons";
import { useVoice } from "../voice/voice-provider";
import { PHASE_LABEL, PhasePill, VoiceOrb, VoiceWave } from "../voice/voice-visuals";
import { useSuggestions } from "./conversation";

export function VoiceHero() {
  const { state, send, setOpen, messages, busy } = useFriend();
  const voice = useVoice();
  const onboarded = !!state?.onboarded;
  const suggestions = useSuggestions(onboarded);
  const talking = voice.active;

  const lastReply = [...messages].reverse().find((m) => m.role === "assistant" && !m.pending && (m.text || m.story));
  const lastUser = [...messages].reverse().find((m) => m.role === "user");

  const ask = (q: string) => {
    if (busy) return;
    setOpen(true);
    void send(q);
  };

  return (
    <section
      aria-label="Talk to Buzzer"
      className="@container relative overflow-hidden rounded-[var(--r-xl)] border border-brand/25 p-6 md:p-8 xl:p-10"
      style={{
        background:
          "radial-gradient(90% 120% at 100% 0%, rgb(240 54 74 / 0.32), transparent 55%), radial-gradient(70% 90% at 0% 100%, rgb(255 122 61 / 0.14), transparent 60%), linear-gradient(160deg, #161b29 0%, #0d111b 100%)",
      }}
    >
      <div className="pitch-lines pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="relative grid items-center gap-4 @xl:grid-cols-[minmax(0,1fr)_auto] @xl:gap-8">
        {/* words */}
        <div className="min-w-0">
          {!talking ? (
            <>
              <p className="eyebrow !text-brand-2">Your personal sports friend</p>
              <h1 className="mt-3 font-display text-[40px] font-extrabold uppercase leading-[0.92] tracking-wide md:text-[56px] xl:text-[64px]">
                {onboarded ? (
                  <>
                    Talk to <span className="brand-text">Buzzer</span>
                  </>
                ) : (
                  <>
                    Meet <span className="brand-text">Buzzer</span>
                  </>
                )}
              </h1>
              <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-fg/80 md:text-[16.5px]">
                {onboarded
                  ? "Ask anything about the sports you love — out loud or by typing. Buzzer remembers your past conversations, who you follow and how much you know, so every answer is about you."
                  : "A sports friend that learns what you love, remembers what you've talked about, and tells you the stories, rivalries and history behind every match."}
              </p>

              {onboarded ? (
                <>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    {voice.supported && (
                      <button onClick={() => void voice.start()} disabled={voice.phase === "starting"} className="btn-primary hidden h-12 px-6 text-[15px] @xl:inline-flex">
                        <IconMic size={18} /> {voice.phase === "starting" ? "Starting…" : "Talk to Buzzer"}
                      </button>
                    )}
                    <button onClick={() => setOpen(true)} className="btn-quiet h-12 px-5 text-[15px]">
                      <IconChat size={18} /> Type instead
                    </button>
                  </div>
                  {voice.error && (
                    <p role="status" className="mt-3 text-[13px] text-brand-2">
                      {voice.error}
                    </p>
                  )}
                  {suggestions.length > 0 && (
                    <div className="mt-6">
                      <p className="eyebrow mb-2.5">Try asking</p>
                      <div className="flex flex-wrap gap-2">
                        {suggestions.slice(0, 4).map((s) => (
                          <button key={s} onClick={() => ask(s)} disabled={busy} className="chip bg-surface/60 text-[13.5px] text-fg/85 backdrop-blur disabled:opacity-50">
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="mt-6 text-[12.5px] leading-relaxed text-muted">
                    <IconBrain size={14} className="mr-1.5 inline -translate-y-px text-good" />
                    {state && state.interests > 0
                      ? `Remembers ${state.interests} thing${state.interests === 1 ? "" : "s"} about you · ${state.level} level`
                      : "Remembers what you tell it"}
                    {" · "}
                    <Link href="/memory" className="underline decoration-line-strong underline-offset-2 hover:text-fg">
                      See what it knows
                    </Link>
                  </p>
                </>
              ) : (
                <Link href="/welcome" className="btn-primary mt-6 h-12 px-7 text-[15px]">
                  Get started — 3 quick questions
                </Link>
              )}
            </>
          ) : (
            <div className="anim-fade-in" aria-live="polite">
              <PhasePill phase={voice.phase} muted={voice.muted} />
              <p className="mt-3 font-display text-[30px] font-bold uppercase leading-tight tracking-wide md:text-[36px]">
                {voice.muted ? "Mic muted" : PHASE_LABEL[voice.phase]}
              </p>

              {(voice.heard || lastUser) && (
                <div className="mt-5">
                  <p className="eyebrow mb-1">You</p>
                  <p className="text-[16px] italic leading-relaxed text-fg/85">“{voice.heard || lastUser?.text}”</p>
                </div>
              )}
              {lastReply && (
                <div className="mt-4 rounded-2xl border border-line bg-surface/70 p-4 backdrop-blur">
                  <p className="eyebrow mb-1 !text-brand-2">Buzzer</p>
                  <p className="line-clamp-5 text-[15.5px] leading-relaxed">{lastReply.story ? lastReply.story.title : lastReply.text}</p>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => voice.setMuted(!voice.muted)}
                  aria-pressed={voice.muted}
                  className={`btn-quiet h-11 px-4 text-[14px] ${voice.muted ? "!border-brand" : ""}`}
                >
                  {voice.muted ? <IconMicOff size={17} /> : <IconMic size={17} />} {voice.muted ? "Unmute" : "Mute"}
                </button>
                <button onClick={voice.stop} className="btn-quiet h-11 px-5 text-[14px]">
                  End
                </button>
                <button onClick={() => setOpen(true)} className="btn-ghost h-11 px-4 text-[14px]">
                  Open conversation
                </button>
              </div>
            </div>
          )}
        </div>

        {/* the mic — first on phones, where it is the main button */}
        <div className="order-first flex flex-col items-center justify-self-center @xl:order-none">
          <VoiceOrb
            phase={voice.phase}
            level={voice.level}
            muted={voice.muted}
            size={104}
            label={talking ? (voice.muted ? "Unmute microphone" : "Mute microphone") : "Talk to Buzzer"}
            disabled={!onboarded || !voice.supported || voice.phase === "starting"}
            onClick={() => (talking ? voice.setMuted(!voice.muted) : void voice.start())}
          />
          <VoiceWave phase={voice.phase} level={voice.level} muted={voice.muted} bars={26} height={34} className="-mt-2" />
          {!talking && onboarded && voice.supported && <p className="mt-2 text-[12.5px] text-muted">Tap and just talk — no button to hold</p>}
        </div>
      </div>
    </section>
  );
}
