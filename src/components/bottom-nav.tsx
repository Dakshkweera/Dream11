"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/memory", label: "What Buzzer knows", icon: "🧠" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-[440px] -translate-x-1/2 border-t border-line bg-bg/95 backdrop-blur"
    >
      {TABS.map((t) => {
        const active = t.href === "/" ? path === "/" || path.startsWith("/match") : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] ${active ? "text-fg" : "text-muted"}`}
          >
            <span aria-hidden className="text-lg leading-none">{t.icon}</span>
            {t.label}
            {active && <span className="brand-gradient mt-0.5 h-0.5 w-6 rounded-full" />}
          </Link>
        );
      })}
    </nav>
  );
}
