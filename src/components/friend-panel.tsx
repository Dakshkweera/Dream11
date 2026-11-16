"use client";

/**
 * Buzzer, available on every screen:
 * - The dock: a floating control (desktop/tablet) or a voice strip above the bottom nav (mobile) that shows the
 *   live voice state with mute and end.
 * - The drawer: the full private conversation. On wide screens it docks as a right-hand column and the page
 *   reflows beside it; on smaller screens it is a sheet.
 * When a page shows Buzzer inline (the watch-along), neither appears — that page's own panel is the conversation.
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BuzzerAvatar } from "./buzzer-avatar";
import { Composer, ConversationMessages, useSuggestions } from "./buzzer/conversation";
import { useFriend } from "./friend-provider";
import { IconBrain, IconChat, IconMic, IconMicOff, IconVolume, IconVolumeOff, IconX } from "./ui/icons";
import { useVoice } from "./voice/voice-provider";
import { PhasePill, VoiceWave } from "./voice/voice-visuals";

/** The element currently in fullscreen (the watch-along), so Buzzer's toasts stay visible inside it. */
function useFullscreenTarget(): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const sync = () => setEl((document.fullscreenElement as HTMLElement | null) ?? null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  return el;
}

function Drawer() {
  const { setOpen, state } = useFriend();
  const voice = useVoice();
  const suggestions = useSuggestions(true);

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-[2px] xl:hidden" onClick={() => setOpen(false)} aria-hidden />
      <section
        role="dialog"
        aria-label="Buzzer, your sports friend"
        className="drawer-anim fixed inset-x-0 bottom-0 z-[71] flex h-[92dvh] flex-col rounded-t-[28px] border border-line bg-bg-2 shadow-2xl shadow-black/60 lg:inset-y-0 lg:left-auto lg:right-0 lg:h-auto lg:w-[var(--drawer-w)] lg:rounded-none lg:border-y-0 lg:border-r-0"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong lg:hidden" aria-hidden />
        <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-3 lg:pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <BuzzerAvatar size={42} live={voice.phase === "speaking"} />
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[16px] font-semibold leading-tight">
                Buzzer {voice.active && <PhasePill phase={voice.phase} muted={voice.muted} />}
              </p>
              <p className="truncate text-[13px] leading-tight text-muted">
                {state?.onboarded ? `Your sports friend · ${state.level} level` : "Your sports friend"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => voice.setReadAloud(!voice.readAloud)}
              disabled={voice.active}
              aria-pressed={voice.readAloud || voice.active}
              aria-label="Read replies aloud"
              title={voice.readAloud || voice.active ? "Replies are read aloud" : "Read replies aloud"}
              className="icon-btn h-10 w-10 disabled:opacity-60"
            >
              {voice.readAloud || voice.active ? <IconVolume size={19} /> : <IconVolumeOff size={19} />}
            </button>
            <button onClick={() => setOpen(false)} className="icon-btn h-10 w-10" aria-label="Close">
              <IconX size={19} />
            </button>
          </div>
        </header>

        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto border-t border-line">
          <ConversationMessages onNavigate={() => setOpen(false)} />
        </div>

        {(!state || state.onboarded) && (
          <footer className="border-t border-line p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <Composer
              suggestions={suggestions}
              note={
                <span className="inline-flex items-center gap-1">
                  <IconBrain size={12} /> Private to you. Buzzer remembers what matters — see Memory.
                </span>
              }
            />
          </footer>
        )}
      </section>
    </>
  );
}

/** Desktop/tablet: a floating control in the corner. Mobile: a voice strip above the bottom nav while talking. */
function Dock() {
  const { setOpen, state } = useFriend();
  const voice = useVoice();
  const talking = voice.active;
  const canTalk = voice.supported && !!state?.onboarded;

  return (
    <>
      {/* desktop / tablet */}
      <div
        className={`anim-fade-in fixed bottom-6 right-6 z-50 hidden h-16 items-center gap-2 rounded-full border bg-surface-2/95 p-2 shadow-2xl shadow-black/50 backdrop-blur md:flex ${
          talking ? "border-brand/50" : "border-line-strong"
        }`}
      >
        <button onClick={() => setOpen(true)} className="flex min-w-0 items-center gap-3 rounded-full pl-1 pr-2 text-left" aria-label="Open the chat with Buzzer">
          <BuzzerAvatar size={44} live={voice.phase === "speaking"} />
          {talking ? (
            <span className="flex flex-col gap-0.5">
              <PhasePill phase={voice.phase} muted={voice.muted} />
              <VoiceWave phase={voice.phase} level={voice.level} muted={voice.muted} bars={16} height={18} barWidth={2.5} gap={2.5} />
            </span>
          ) : (
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold">Ask Buzzer</span>
              <span className="block text-[12.5px] text-muted">Your sports friend</span>
            </span>
          )}
        </button>
        {talking ? (
          <>
            <button
              onClick={() => voice.setMuted(!voice.muted)}
              aria-pressed={voice.muted}
              aria-label={voice.muted ? "Unmute microphone" : "Mute microphone"}
              className="icon-btn h-12 w-12 text-fg"
            >
              {voice.muted ? <IconMicOff size={20} /> : <IconMic size={20} />}
            </button>
            <button onClick={voice.stop} aria-label="End voice conversation" className="btn-quiet h-12 px-4 text-[14px]">
              End
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setOpen(true)} aria-label="Type to Buzzer" className="icon-btn h-12 w-12 text-fg">
              <IconChat size={20} />
            </button>
            {canTalk && (
              <button
                onClick={() => void voice.start()}
                disabled={voice.phase === "starting"}
                aria-label="Talk to Buzzer, hands-free"
                className="btn-primary h-12 px-5 text-[15px]"
              >
                <IconMic size={18} /> {voice.phase === "starting" ? "Starting…" : "Talk"}
              </button>
            )}
          </>
        )}
      </div>

      {/* mobile: only while talking (the bottom nav's mic starts it) */}
      {talking && (
        <div className="anim-fade-in fixed inset-x-3 bottom-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom)+10px)] z-50 flex h-14 items-center gap-2 rounded-full border border-brand/50 bg-surface-2/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur md:hidden">
          <button onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-2.5 pl-1 text-left" aria-label="Open the chat with Buzzer">
            <BuzzerAvatar size={40} live={voice.phase === "speaking"} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <PhasePill phase={voice.phase} muted={voice.muted} />
              <VoiceWave phase={voice.phase} level={voice.level} muted={voice.muted} bars={14} height={16} barWidth={2.5} gap={2.5} />
            </span>
          </button>
          <button
            onClick={() => voice.setMuted(!voice.muted)}
            aria-pressed={voice.muted}
            aria-label={voice.muted ? "Unmute microphone" : "Mute microphone"}
            className="icon-btn h-11 w-11 text-fg"
          >
            {voice.muted ? <IconMicOff size={19} /> : <IconMic size={19} />}
          </button>
          <button onClick={voice.stop} aria-label="End voice conversation" className="btn-quiet h-11 px-4 text-[14px]">
            End
          </button>
        </div>
      )}
    </>
  );
}

export function FriendPanel() {
  const { open, setOpen, toast, embedded } = useFriend();
  const path = usePathname();
  const focused = path === "/welcome"; // first run: no floating Buzzer
  const fullscreenTarget = useFullscreenTarget();
  const showDrawer = open && !embedded;

  // Wide screens reflow the page beside the docked drawer (see .shell-main in globals.css).
  useEffect(() => {
    const root = document.documentElement;
    if (showDrawer) root.dataset.buzzer = "open";
    else delete root.dataset.buzzer;
    return () => {
      delete root.dataset.buzzer;
    };
  }, [showDrawer]);

  useEffect(() => {
    if (!showDrawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDrawer, setOpen]);

  const ui = (
    <>
      {toast && !showDrawer && (
        <div
          role="status"
          className="anim-fade-in fixed bottom-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom)+76px)] left-1/2 z-[80] flex w-[min(380px,calc(100vw-32px))] -translate-x-1/2 items-center gap-2 rounded-2xl border border-good/30 bg-surface-2 px-4 py-2.5 text-[13px] text-fg shadow-xl md:bottom-28 md:left-auto md:right-6 md:translate-x-0"
        >
          <IconBrain size={16} className="shrink-0 text-good" /> {toast}
        </div>
      )}
      {!embedded && !focused && !showDrawer && <Dock />}
      {showDrawer && <Drawer />}
    </>
  );

  // In fullscreen only the fullscreen element is visible, so anything Buzzer shows moves inside it.
  return fullscreenTarget ? createPortal(ui, fullscreenTarget) : ui;
}
