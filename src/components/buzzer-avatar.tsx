/**
 * Buzzer's mark: a warm gradient disc with a small voice waveform, used everywhere Buzzer appears.
 * `live` adds a pulsing ring (listening or speaking).
 */
export function BuzzerAvatar({ size = 36, live = false, className = "" }: { size?: number; live?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`brand-gradient relative inline-flex shrink-0 items-center justify-center rounded-full shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] ${live ? "anim-ring" : ""} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round">
        <path d="M5 10v4M9.5 6.5v11M14.5 8.5v7M19 10.5v3" />
      </svg>
    </span>
  );
}

/** The Buzzer wordmark with its mark. */
export function BuzzerLogo({ size = 32, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BuzzerAvatar size={size} />
      {wordmark && <span className="font-display text-[22px] font-bold uppercase leading-none tracking-wide">Buzzer</span>}
    </span>
  );
}
