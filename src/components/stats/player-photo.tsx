"use client";

/* eslint-disable @next/next/no-img-element -- Wikimedia images are served as-is from Commons with their credit */
import { useState } from "react";
import type { Portrait } from "@/lib/stats/schema";
import { EntityAvatar } from "../ui/sport";

/**
 * A player's photo from Wikimedia Commons (licence and author in the tooltip), or their initials when there is
 * no suitable photo or it fails to load. Never a made-up or scraped image.
 */
export function PlayerPhoto({
  playerId,
  name,
  portrait,
  size = 36,
  className = "",
}: {
  playerId: string;
  name: string;
  portrait?: Portrait | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const entityId = playerId.startsWith("player:") ? playerId : undefined;
  if (!portrait || failed) return <EntityAvatar id={entityId} name={name} size={size} className={className} />;
  return (
    <img
      src={portrait.thumbUrl}
      alt={name}
      title={portrait.attribution}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full bg-surface-2 object-cover object-top ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** The credit line a reused photo needs, linking to its Commons page and licence. */
export function PhotoCredit({ portrait }: { portrait: Portrait }) {
  return (
    <p className="text-[11.5px] leading-snug text-subtle">
      Photo:{" "}
      <a href={portrait.sourcePage} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-fg">
        {portrait.author}
      </a>
      ,{" "}
      {portrait.licenseUrl ? (
        <a href={portrait.licenseUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-fg">
          {portrait.license}
        </a>
      ) : (
        portrait.license
      )}
      , via Wikimedia Commons
    </p>
  );
}
