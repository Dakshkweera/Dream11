"use client";

/**
 * How Buzzer's voice looks: a waveform that follows the fan's real mic level while listening, distinct
 * animations for thinking and speaking, and the big voice orb. Purely visual — the state comes from useVoice().
 */
import { IconMic, IconMicOff, IconVolume } from "../ui/icons";
import type { Phase } from "./use-conversation";

export const PHASE_LABEL: Record<Phase, string> = {
  off: "Tap to talk",
  starting: "Starting the mic…",
  listening: "Listening — just start talking",
  hearing: "Listening…",
  transcribing: "Got it…",
  thinking: "Thinking…",
  speaking: "Speaking — talk any time to cut in",
};

export const PHASE_SHORT: Record<Phase, string> = {
  off: "Ready",
  starting: "Starting…",
  listening: "Listening",
  hearing: "Hearing you",
  transcribing: "Got it",
  thinking: "Thinking",
  speaking: "Speaking",
};

/** The colour that says which state Buzzer is in. */
export function phaseTone(phase: Phase, muted: boolean): string {
  if (muted) return "text-muted";
  if (phase === "listening" || phase === "hearing") return "text-good";
  if (phase === "thinking" || phase === "transcribing") return "text-gold";
  if (phase === "speaking") return "text-brand-2";
  return "text-muted";
}

type WaveMode = "idle" | "live" | "thinking" | "speaking";
export function waveMode(phase: Phase, muted: boolean): WaveMode {
  if (phase === "speaking") return "speaking";
  if (phase === "thinking" || phase === "transcribing") return "thinking";
  if (!muted && (phase === "listening" || phase === "hearing")) return "live";
  return "idle";
}

/**
 * A row of bars. Live: heights follow the mic level (real sound-reactive). Speaking and thinking: animated,
 * because the speaker's own audio isn't analysed.
 */
export function VoiceWave({
  phase,
  level,
  muted = false,
  bars = 28,
  height = 40,
  barWidth = 3,
  gap = 3,
  className = "",
}: {
  phase: Phase;
  level: number;
  muted?: boolean;
  bars?: number;
  height?: number;
  barWidth?: number;
  gap?: number;
  className?: string;
}) {
  const mode = waveMode(phase, muted);
  const amp = Math.max(0.08, Math.min(1, level * 9));
  const seed = level * 400; // the level changes ~14×/s, so the shape keeps moving with the voice

  return (
    <span
      aria-hidden
      className={`inline-flex items-center ${mode === "speaking" ? "wave-speaking" : mode === "thinking" ? "wave-thinking" : ""} ${className}`}
      style={{ height, gap }}
    >
      {Array.from({ length: bars }, (_, i) => {
        const env = 0.3 + 0.7 * Math.sin((Math.PI * (i + 0.5)) / bars); // taller in the middle
        let h: number;
        if (mode === "live") {
          const jitter = 0.5 + 0.5 * Math.abs(Math.sin(i * 1.7 + seed));
          h = Math.max(3, height * amp * env * jitter);
        } else if (mode === "speaking") {
          h = Math.max(4, height * env * 0.9);
        } else if (mode === "thinking") {
          h = Math.max(4, height * 0.7);
        } else {
          h = 3 + Math.round(env * 3);
        }
        return (
          <span
            key={i}
            className="wave-bar rounded-full"
            style={{
              width: barWidth,
              height: h,
              background: mode === "idle" ? "var(--border-strong)" : "linear-gradient(180deg, var(--brand-2), var(--brand))",
              animationDelay: mode === "speaking" ? `${((i * 97) % 900) / 1000}s` : mode === "thinking" ? `${(i % bars) * 0.05}s` : undefined,
            }}
          />
        );
      })}
    </span>
  );
}

/** The big round mic: idle it breathes; listening it swells with your voice; thinking spins; speaking ripples. */
export function VoiceOrb({
  phase,
  level,
  muted = false,
  size = 112,
  onClick,
  disabled,
  label,
}: {
  phase: Phase;
  level: number;
  muted?: boolean;
  size?: number;
  onClick?: () => void;
  disabled?: boolean;
  label: string;
}) {
  const mode = waveMode(phase, muted);
  const swell = mode === "live" ? 1 + Math.min(level * 5, 0.32) : 1;
  const icon = Math.round(size * 0.32);
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size * 1.5, height: size * 1.5 }}>
      {/* glow */}
      <span
        aria-hidden
        className={`absolute rounded-full blur-2xl ${mode === "idle" ? "anim-breathe" : ""}`}
        style={{
          width: size * 1.25,
          height: size * 1.25,
          background: "radial-gradient(circle, rgb(240 54 74 / 0.45), rgb(255 122 61 / 0.15) 55%, transparent 70%)",
          transform: `scale(${swell})`,
          transition: "transform 90ms linear",
        }}
      />
      {/* ripples while live or speaking */}
      {(mode === "live" || mode === "speaking") && (
        <>
          <span aria-hidden className="anim-ripple absolute rounded-full border border-brand-2/50" style={{ width: size, height: size }} />
          <span aria-hidden className="anim-ripple absolute rounded-full border border-brand/40" style={{ width: size, height: size, animationDelay: "0.9s" }} />
        </>
      )}
      {/* thinking: a turning ring */}
      {mode === "thinking" && (
        <span
          aria-hidden
          className="anim-spin absolute rounded-full"
          style={{
            width: size + 14,
            height: size + 14,
            background: "conic-gradient(from 0deg, transparent 0 55%, var(--gold) 80%, transparent 100%)",
            mask: "radial-gradient(circle, transparent calc(50% - 3px), #000 calc(50% - 2px))",
            WebkitMask: "radial-gradient(circle, transparent calc(50% - 3px), #000 calc(50% - 2px))",
          }}
        />
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="brand-gradient relative flex items-center justify-center rounded-full text-white shadow-[0_18px_50px_-14px_rgb(240_54_74/0.8),inset_0_1px_0_rgb(255_255_255/0.3)] transition-transform duration-100 enabled:hover:scale-[1.03] enabled:active:scale-95 disabled:opacity-70"
        style={{ width: size, height: size, transform: `scale(${swell})` }}
      >
        {muted ? <IconMicOff size={icon} /> : mode === "speaking" ? <IconVolume size={icon} /> : <IconMic size={icon} />}
      </button>
    </span>
  );
}

/** A small coloured dot + word for the current state. */
export function PhasePill({ phase, muted, className = "" }: { phase: Phase; muted: boolean; className?: string }) {
  const tone = phaseTone(phase, muted);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider ${tone} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${phase !== "off" && !muted ? "anim-live" : ""}`} />
      {muted ? "Mic muted" : PHASE_SHORT[phase]}
    </span>
  );
}
