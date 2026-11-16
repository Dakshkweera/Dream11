"use client";

/**
 * The hero's backdrop: a still frame from the real Paris 2024 final clip that ships with the app, and — on
 * larger screens, once the page has loaded, unless the visitor prefers reduced motion or saves data — the clip
 * itself, muted, looping a short stretch so it never downloads the whole match.
 */
import Image from "next/image";
import { useEffect, useState } from "react";
import heroFrame from "../../../public/landing/hero-frame.webp";

const CLIP = "/match/clip-basketball.mp4";
const FROM = 100;
const TO = 128;

export function HeroBackdrop() {
  const [play, setPlay] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || conn?.saveData || window.innerWidth < 768) return;
    const start = () => window.setTimeout(() => setPlay(true), 1200);
    if (document.readyState === "complete") {
      const t = start();
      return () => window.clearTimeout(t);
    }
    let t = 0;
    const onLoad = () => (t = start());
    window.addEventListener("load", onLoad, { once: true });
    return () => {
      window.removeEventListener("load", onLoad);
      window.clearTimeout(t);
    };
  }, []);

  return (
    <div className="absolute inset-0" aria-hidden>
      <Image src={heroFrame} alt="" fill priority sizes="100vw" placeholder="blur" className="object-cover object-[60%_40%]" />
      {play && (
        <video
          src={`${CLIP}#t=${FROM}`}
          muted
          playsInline
          autoPlay
          preload="auto"
          tabIndex={-1}
          onPlaying={() => setVisible(true)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.currentTime >= TO || v.currentTime < FROM - 1) v.currentTime = FROM;
          }}
          className={`absolute inset-0 h-full w-full object-cover object-[60%_40%] transition-opacity duration-1000 ${visible ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}
