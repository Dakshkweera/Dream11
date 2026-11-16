"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useFriend } from "./friend-provider";

type View = { chips: string[]; next: { topic: string; why: string }[] };
type Compare = { level: string; newFan: View; you: View };

/** The same home screen for a brand-new fan and for you, so the effect of memory is visible. */
export function CompareCard() {
  const { epoch } = useFriend();
  const [data, setData] = useState<Compare | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Compare>("/api/compare", { context: { surface: "home", entityIds: [] } })
      .then((r) => !cancelled && setData(r))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [epoch]);

  if (!data)
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-label="Loading">
        {[0, 1].map((i) => (
          <div key={i} className="skeleton h-56" />
        ))}
      </div>
    );

  const col = (title: string, v: View, accent: boolean) => (
    <div className={`rounded-[var(--r-lg)] border p-5 md:p-6 ${accent ? "border-brand/40 bg-gradient-to-br from-brand/15 to-surface" : "border-line bg-surface"}`}>
      <p className={`font-display text-[20px] font-bold uppercase tracking-wide ${accent ? "text-brand-2" : "text-muted"}`}>{title}</p>
      <p className="eyebrow mt-3 !text-[11px]">Would bring up</p>
      {v.next.length ? (
        <ul className="mt-1 space-y-1">
          {v.next.map((n) => (
            <li key={n.topic} className="text-[14.5px] leading-snug">
              {n.topic} <span className="text-muted">· {n.why}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[14px] text-muted">Nothing yet</p>
      )}
      <p className="eyebrow mt-4 !text-[11px]">Suggests</p>
      <ul className="mt-1 space-y-1">
        {v.chips.map((c) => (
          <li key={c} className="text-[14px] leading-snug text-fg/90">
            “{c}”
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section>
      <h2 className="text-[18px] font-semibold">Same app, two people</h2>
      <p className="mb-4 text-[14px] text-muted">What Buzzer would bring up for a brand-new fan, and for you now that it knows you.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {col("A new fan", data.newFan, false)}
        {col("You", data.you, true)}
      </div>
    </section>
  );
}
