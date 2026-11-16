"use client";

/**
 * What Buzzer's memory says about each player or team, for personalising lists: followed (the fan said so),
 * interested (Buzzer inferred it), or not into. Read from the existing /api/memory; refreshes when the
 * profile changes.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useFriend } from "./friend-provider";

export type Signal = { kind: "follow" | "interest" | "not"; strength: number };
type Mem = { kind: string; source: "stated" | "inferred"; polarity: "positive" | "negative"; entity: string | null; strength: number };

export function useProfileSignals(): { ready: boolean; signal: (name: string) => Signal | undefined; picks: string[] } {
  const { epoch, state } = useFriend();
  const [data, setData] = useState<{ map: Map<string, Signal>; picks: string[] } | null>(null);

  useEffect(() => {
    if (!state?.onboarded) return;
    let cancelled = false;
    api<{ memories: Mem[]; picks: string[] }>("/api/memory")
      .then((r) => {
        if (cancelled) return;
        const map = new Map<string, Signal>();
        for (const m of r.memories) {
          if (!m.entity || (m.kind !== "stated_preference" && m.kind !== "inferred_interest")) continue;
          const kind: Signal["kind"] = m.polarity === "negative" ? "not" : m.source === "stated" ? "follow" : "interest";
          const prev = map.get(m.entity);
          // A stated preference outranks an inference; "not into" outranks both.
          const rank = { not: 3, follow: 2, interest: 1 };
          if (!prev || rank[kind] > rank[prev.kind] || (kind === prev.kind && m.strength > prev.strength)) map.set(m.entity, { kind, strength: m.strength });
        }
        setData({ map, picks: r.picks });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [epoch, state?.onboarded]);

  return {
    ready: !!data,
    signal: (name) => data?.map.get(name),
    picks: data?.picks ?? [],
  };
}
