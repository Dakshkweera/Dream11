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

  if (!data) return null;

  const col = (title: string, v: View, accent: boolean) => (
    <div className={`rounded-xl border p-3 ${accent ? "border-brand/50 bg-brand/5" : "border-line bg-bg"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${accent ? "text-brand-2" : "text-muted"}`}>{title}</p>
      <p className="mt-2 text-[10px] uppercase tracking-wider text-muted">Would bring up</p>
      {v.next.length ? (
        <ul className="mt-1 space-y-1">
          {v.next.map((n) => (
            <li key={n.topic} className="text-[12px] leading-snug">
              {n.topic} <span className="text-muted">· {n.why}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12px] text-muted">Nothing yet</p>
      )}
      <p className="mt-3 text-[10px] uppercase tracking-wider text-muted">Suggests</p>
      <ul className="mt-1 space-y-1">
        {v.chips.map((c) => (
          <li key={c} className="text-[12px] leading-snug text-fg/90">
            “{c}”
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold">What a new fan sees vs. you</h2>
      <p className="mb-2 text-[11px] text-muted">The same screen, before and after Saathi has learned about you.</p>
      <div className="grid grid-cols-2 gap-2">
        {col("A new fan", data.newFan, false)}
        {col("You", data.you, true)}
      </div>
    </section>
  );
}
