"use client";

/**
 * One application shell for every page.
 * - Desktop (≥1024): a compact left sidebar with labels.
 * - Tablet (768–1023) and the immersive watch-along: an icon rail.
 * - Mobile (<768): a compact header and a bottom nav with Buzzer's mic in the middle.
 * The first-run welcome screen has no chrome.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { initialsOf } from "@/lib/ui/identity";
import { BuzzerAvatar, BuzzerLogo } from "../buzzer-avatar";
import { useFriend } from "../friend-provider";
import { IconBrain, IconCompass, IconHome, IconMatches, IconMic, IconUser } from "../ui/icons";
import { useVoice } from "../voice/voice-provider";

type NavItem = { href: string; label: string; icon: ComponentType<{ size?: number }>; active: (p: string) => boolean };

const NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: IconHome, active: (p) => p === "/home" },
  { href: "/matches", label: "Matches", icon: IconMatches, active: (p) => p.startsWith("/matches") || p.startsWith("/match/") },
  { href: "/discover", label: "Discover", icon: IconCompass, active: (p) => p.startsWith("/discover") },
  { href: "/memory", label: "Memory", icon: IconBrain, active: (p) => p.startsWith("/memory") },
];

function ProfileAvatar({ size = 36 }: { size?: number }) {
  const { state } = useFriend();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-3 font-semibold text-fg"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {state?.name ? initialsOf(state.name) : <IconUser size={Math.round(size * 0.5)} />}
    </span>
  );
}

function Sidebar({ path, rail }: { path: string; rail: boolean }) {
  const { state } = useFriend();
  // `rail` forces the icon rail (watch-along); otherwise rail on tablet, full sidebar on desktop.
  const full = rail ? "hidden" : "hidden lg:flex";
  const compact = rail ? "flex" : "flex lg:hidden";
  return (
    <aside
      aria-label="Main"
      className={`sticky top-0 z-40 hidden h-dvh shrink-0 flex-col border-r border-line bg-bg-2/80 backdrop-blur md:flex ${
        rail ? "w-[var(--rail-w)]" : "w-[var(--rail-w)] lg:w-[var(--sidebar-w)]"
      }`}
    >
      {/* full sidebar */}
      <div className={`${full} h-full flex-col px-4 pb-5 pt-6`}>
        <Link href="/home" className="px-2" aria-label="Buzzer home">
          <BuzzerLogo size={34} />
        </Link>
        <nav className="mt-9 flex flex-col gap-1">
          {NAV.map((n) => {
            const on = n.active(path);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`relative flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors ${
                  on ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg"
                }`}
              >
                {on && <span className="brand-gradient absolute -left-4 h-6 w-1 rounded-r-full" aria-hidden />}
                <span className={on ? "text-brand-2" : ""}>
                  <n.icon size={20} />
                </span>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <Link
          href="/memory"
          className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-line-strong"
          aria-label="Your profile and what Buzzer knows"
        >
          <ProfileAvatar size={38} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[14px] font-semibold">{state?.name ?? "Your profile"}</span>
            <span className="block truncate text-[12px] capitalize text-muted">{state?.onboarded ? `${state.level} fan · ${state.interests} interests` : "Set up your profile"}</span>
          </span>
        </Link>
      </div>

      {/* icon rail */}
      <div className={`${compact} h-full flex-col items-center pb-5 pt-5`}>
        <Link href="/home" aria-label="Buzzer home">
          <BuzzerAvatar size={38} />
        </Link>
        <nav className="mt-8 flex flex-col items-center gap-1.5">
          {NAV.map((n) => {
            const on = n.active(path);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                aria-label={n.label}
                title={n.label}
                className={`flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-2xl text-[10.5px] font-medium transition-colors ${
                  on ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg"
                }`}
              >
                <span className={on ? "text-brand-2" : ""}>
                  <n.icon size={20} />
                </span>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <Link href="/memory" aria-label="Your profile" title="Your profile">
          <ProfileAvatar size={38} />
        </Link>
      </div>
    </aside>
  );
}

function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur md:hidden">
      <Link href="/home" aria-label="Buzzer home">
        <BuzzerLogo size={30} />
      </Link>
      <Link href="/memory" aria-label="Your profile">
        <ProfileAvatar size={34} />
      </Link>
    </header>
  );
}

function MobileNav({ path }: { path: string }) {
  const { setOpen, state } = useFriend();
  const voice = useVoice();
  const canTalk = voice.supported && !!state?.onboarded;
  const items = [NAV[0], NAV[1], null, NAV[2], NAV[3]];

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 grid h-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom))] grid-cols-5 border-t border-line bg-bg-2/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {items.map((n) => {
        if (!n) {
          return (
            <div key="buzzer" className="flex items-start justify-center">
              <button
                onClick={() => (voice.active || !canTalk ? setOpen(true) : void voice.start())}
                aria-label={voice.active ? "Open the conversation with Buzzer" : canTalk ? "Talk to Buzzer" : "Open Buzzer"}
                className={`brand-gradient -mt-5 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_10px_30px_-8px_rgb(240_54_74/0.85)] ring-4 ring-bg ${
                  voice.active ? "anim-ring" : ""
                }`}
              >
                <IconMic size={24} />
              </button>
            </div>
          );
        }
        const on = n.active(path);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={on ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${on ? "text-fg" : "text-muted"}`}
          >
            <span className={on ? "text-brand-2" : ""}>
              <n.icon size={22} />
            </span>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === "/welcome") return <>{children}</>; // first run is a focused screen
  const immersive = /^\/match\/[^/]+\/watch/.test(path);

  return (
    <div className="flex min-h-dvh">
      <Sidebar path={path} rail={immersive} />
      <div className="shell-main flex-1">
        {!immersive && <MobileHeader />}
        {children}
      </div>
      {!immersive && <MobileNav path={path} />}
    </div>
  );
}
