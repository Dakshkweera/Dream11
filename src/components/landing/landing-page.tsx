/**
 * The public landing page: one screen that says what Buzzer is and launches the app (/home).
 * The sample exchange is a real reply Buzzer gave; the backdrop is the Paris 2024 final clip the app ships with.
 */
import Link from "next/link";
import type { ComponentType } from "react";
import { BuzzerAvatar, BuzzerLogo } from "../buzzer-avatar";
import { IconArrowRight, IconBook, IconBrain, IconMic, IconPlay } from "../ui/icons";
import { HeroBackdrop } from "./hero-backdrop";
import "./landing.css";

const APP = "/home";

const POINTS: { icon: ComponentType<{ size?: number }>; title: string; text: string }[] = [
  { icon: IconMic, title: "Talk or type", text: "Hands-free voice, in English and Hinglish." },
  { icon: IconBook, title: "Stories", text: "The rivalries and history behind the game." },
  { icon: IconPlay, title: "Watch along", text: "Ask Buzzer about any moment in the replay." },
  { icon: IconBrain, title: "Knows you", text: "Your teams, your level — and you control it." },
];

/** The animated "speaking" bars, reusing the app's waveform styles. */
function Wave() {
  const bars = 18;
  return (
    <span aria-hidden className="wave-speaking mt-2 flex items-center" style={{ height: 20, gap: 3 }}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="wave-bar rounded-full"
          style={{
            width: 3,
            height: Math.max(4, 20 * (0.3 + 0.7 * Math.sin((Math.PI * (i + 0.5)) / bars))),
            background: "linear-gradient(180deg, var(--brand-2), var(--brand))",
            animationDelay: `${((i * 97) % 900) / 1000}s`,
          }}
        />
      ))}
    </span>
  );
}

export function LandingPage() {
  return (
    <div className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      <HeroBackdrop />
      <div
        className="absolute inset-0"
        aria-hidden
        style={{
          background:
            "linear-gradient(90deg, rgb(7 9 15 / 0.97) 0%, rgb(7 9 15 / 0.85) 40%, rgb(7 9 15 / 0.4) 75%, rgb(7 9 15 / 0.6) 100%), linear-gradient(0deg, rgb(7 9 15 / 0.95) 0%, transparent 45%), radial-gradient(55% 60% at 12% 35%, rgb(240 54 74 / 0.2), transparent 70%)",
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-[1280px] items-center justify-between px-5 pt-5 md:px-10 md:pt-7">
        <BuzzerLogo size={34} />
        <Link href={APP} className="btn-quiet h-10 border-white/15 bg-white/5 px-5 text-[14px] backdrop-blur">
          Launch
        </Link>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[1280px] flex-1 items-center gap-10 px-5 py-12 md:px-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div>
          <p className="eyebrow inline-flex items-center gap-2 !text-fg/80">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Your personal AI sports friend
          </p>
          <h1 className="hero-title mt-5 font-display font-extrabold uppercase tracking-wide">
            Don&apos;t just watch sports.
            <br />
            <span className="brand-text">Feel the story.</span>
          </h1>
          <p className="mt-6 max-w-[540px] text-[17px] leading-relaxed text-fg/85 md:text-[19px]">
            Buzzer is a sports friend you can talk to. It learns what you follow and how much you know, then tells you the stories behind every player and
            moment.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href={APP} className="btn-primary h-14 px-9 text-[17px]">
              Launch Buzzer <IconArrowRight size={19} />
            </Link>
            <span className="text-[13px] text-muted">Free prototype · no sign-up</span>
          </div>
        </div>

        <figure className="glass float-slow hidden rounded-[22px] p-5 lg:block" aria-label="A real exchange with Buzzer during the Paris 2024 final">
          <div className="flex items-center gap-3">
            <BuzzerAvatar size={36} live />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-tight">My Buzzer</p>
              <p className="text-[12px] text-muted">Watching USA vs France with you</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <p className="brand-gradient ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-md px-3.5 py-2 text-[14px] leading-snug text-white">
              Who was France&apos;s top scorer in this final?
            </p>
            <div className="flex gap-2">
              <BuzzerAvatar size={24} className="mt-0.5" />
              <div className="rounded-2xl rounded-tl-md bg-surface-2/90 px-3.5 py-2.5 text-[14px] leading-relaxed">
                Victor Wembanyama, yaar! He scored 26 points, the most of anyone on France.
                <Wave />
              </div>
            </div>
          </div>
        </figure>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-[1280px] px-5 pb-6 md:px-10 md:pb-8">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/10 pt-6 md:grid-cols-4">
          {POINTS.map((p) => (
            <li key={p.title} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand-2">
                <p.icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold">{p.title}</span>
                <span className="block text-[13px] leading-snug text-muted">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[11.5px] text-subtle">
          Experimental prototype · Not affiliated with Dream11 · Background: Paris 2024 Olympic final highlights
        </p>
      </footer>
    </div>
  );
}
