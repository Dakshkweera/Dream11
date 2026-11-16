"use client";

/**
 * The match's public chat: people talking to people while they watch. Buzzer is never a participant here —
 * the fan's private Buzzer lives in its own panel.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { COMMUNITY_TEXT_MAX, type CommunityAuthor } from "@/lib/community";
import { initialsOf, teamIdentity } from "@/lib/ui/identity";
import { useFriend } from "../friend-provider";
import { IconChevronDown, IconGlobe, IconSend, IconSmile, IconUsers } from "../ui/icons";
import { useCommunity, type UiMessage } from "./use-community";

const QUICK = ["🔥", "👏", "😮", "😂", "💯", "😬"];

function colourFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 42%)`;
}

function time(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Avatar({ a }: { a: CommunityAuthor }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
      style={{ background: colourFor(a.id) }}
    >
      {initialsOf(a.name)}
    </span>
  );
}

function TeamFlair({ team }: { team?: string }) {
  if (!team) return null;
  const t = teamIdentity(team);
  return (
    <span className="rounded px-1 py-px text-[9.5px] font-bold tracking-wide text-white" style={{ background: t.primary }}>
      {t.code}
    </span>
  );
}

/** Consecutive messages from the same person within two minutes form one group. */
function group(messages: UiMessage[]) {
  const out: { author: CommunityAuthor; mine: boolean; items: UiMessage[] }[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    const prev = last?.items[last.items.length - 1];
    if (last && last.author.id === m.author.id && prev && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 120_000) last.items.push(m);
    else out.push({ author: m.author, mine: !!m.mine, items: [m] });
  }
  return out;
}

export function CommunityPanel({ matchId, matchLabel, className = "", collapsed, onToggle }: { matchId: string; matchLabel: string; className?: string; collapsed?: boolean; onToggle?: () => void }) {
  const { state } = useFriend();
  const me = useMemo<CommunityAuthor>(() => ({ id: "me", name: state?.name ?? "You" }), [state?.name]);
  const chat = useCommunity(matchId, me);
  const [text, setText] = useState("");
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [showQuick, setShowQuick] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // How many messages there were when the fan scrolled up to read; null while following the newest.
  const [anchor, setAnchor] = useState<number | null>(null);
  const unseen = anchor == null ? 0 : Math.max(0, chat.messages.length - anchor);
  const groups = useMemo(() => group(chat.messages), [chat.messages]);

  // Keep to the newest message unless the fan has scrolled up to read.
  useEffect(() => {
    const el = listRef.current;
    if (el && anchor == null) el.scrollTo({ top: el.scrollHeight }); // instant, so it never reads as the fan scrolling up
  }, [chat.messages.length, anchor]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom) setAnchor(null);
    else if (anchor == null) setAnchor(chat.messages.length);
  };
  const jump = () => setAnchor(null);

  function submit(t: string) {
    const v = t.trim();
    if (!v) return;
    setText("");
    setShowQuick(false);
    setAnchor(null);
    void chat.send(v.slice(0, COMMUNITY_TEXT_MAX));
  }

  return (
    <section aria-label="Match chat" className={`panel flex min-h-0 flex-col overflow-hidden ${className}`}>
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-info/15 text-info">
          <IconUsers size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[15px] font-semibold leading-tight">
            Match chat
            {chat.source === "mock" && <span className="badge badge-muted !text-[9.5px]">Preview</span>}
          </p>
          <p className="flex items-center gap-1.5 truncate text-[12px] text-muted">
            {chat.online != null && (
              <>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-good" />
                {chat.online.toLocaleString()} watching ·{" "}
              </>
            )}
            {matchLabel}
          </p>
        </div>
        {onToggle && (
          <button onClick={onToggle} className="icon-btn hidden h-9 w-9 lg:inline-flex 3xl:hidden" aria-expanded={!collapsed} aria-label={collapsed ? "Expand match chat" : "Collapse match chat"}>
            <IconChevronDown size={18} className={`transition-transform ${collapsed ? "-rotate-90" : ""}`} />
          </button>
        )}
      </header>

      {!collapsed && (
        <>
          {chat.source === "mock" && (
            <p className="shrink-0 truncate border-b border-line bg-surface-2/60 px-4 py-1.5 text-[11px] text-muted" title="Sample conversation while the live community is being connected. Your messages stay on this device for now.">
              Sample chat — live community coming soon. Your messages stay on this device.
            </p>
          )}
          <div className="relative min-h-0 flex-1">
            <div ref={listRef} onScroll={onScroll} className="thin-scroll h-full space-y-3 overflow-y-auto px-3 py-3" aria-live="polite">
              {chat.status === "loading" && (
                <div className="space-y-3 p-1" aria-label="Loading chat">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton h-12" />
                  ))}
                </div>
              )}
              {chat.status === "error" && <p className="p-4 text-center text-[13px] text-brand-2">{chat.error}</p>}
              {chat.status === "ready" && chat.messages.length === 0 && (
                <p className="p-6 text-center text-[13px] text-muted">No one has said anything yet. Start the conversation.</p>
              )}
              {groups.map((g) => (
                <div key={g.items[0].id} className={`flex gap-2.5 ${g.mine ? "flex-row-reverse" : ""}`}>
                  {!g.mine && <Avatar a={g.author} />}
                  <div className={`flex min-w-0 max-w-[85%] flex-col gap-1 ${g.mine ? "items-end" : "items-start"}`}>
                    <p className="flex items-center gap-1.5 px-1 text-[12px]">
                      <span className="font-semibold text-fg/90">{g.mine ? "You" : g.author.name}</span>
                      <TeamFlair team={g.author.team} />
                      <span className="text-subtle">{time(g.items[0].createdAt)}</span>
                    </p>
                    {g.items.map((m) => (
                      <div key={m.id} className="group relative">
                        <div
                          className={`rounded-2xl px-3.5 py-2 text-[14px] leading-snug ${
                            g.mine ? "rounded-tr-md bg-info/20 text-fg" : "rounded-tl-md bg-surface-3"
                          } ${m.status === "sending" ? "opacity-60" : ""}`}
                        >
                          {m.text}
                        </div>
                        {m.status === "failed" && (
                          <button onClick={() => chat.retry(m.clientId!)} className="mt-0.5 text-[11px] text-brand-2 underline">
                            Not sent — retry
                          </button>
                        )}
                        <div className={`mt-1 flex flex-wrap items-center gap-1 ${g.mine ? "justify-end" : ""}`}>
                          {m.reactions.map((r) => (
                            <button
                              key={r.emoji}
                              onClick={() => void chat.react(m.id, r.emoji)}
                              aria-pressed={r.mine}
                              aria-label={`${r.emoji} ${r.count}`}
                              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[11.5px] ${
                                r.mine ? "border-brand/60 bg-brand/15" : "border-line bg-surface-2"
                              }`}
                            >
                              {r.emoji} <span className="tabular-nums text-muted">{r.count}</span>
                            </button>
                          ))}
                          {!m.status && (
                            <button
                              onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                              aria-label="React"
                              className="icon-btn h-6 w-6 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                            >
                              <IconSmile size={14} />
                            </button>
                          )}
                        </div>
                        {pickerFor === m.id && (
                          <div className={`anim-fade-in absolute z-10 mt-1 flex gap-0.5 rounded-full border border-line-strong bg-surface-2 p-1 shadow-xl ${g.mine ? "right-0" : "left-0"}`}>
                            {QUICK.map((e) => (
                              <button
                                key={e}
                                onClick={() => {
                                  void chat.react(m.id, e);
                                  setPickerFor(null);
                                }}
                                className="h-8 w-8 rounded-full text-[16px] hover:bg-surface-3"
                                aria-label={`React ${e}`}
                              >
                                {e}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {unseen > 0 && (
              <button onClick={jump} className="btn-quiet absolute bottom-3 left-1/2 h-8 -translate-x-1/2 px-3 text-[12px] shadow-lg">
                {unseen} new message{unseen === 1 ? "" : "s"} <IconChevronDown size={14} />
              </button>
            )}
          </div>

          <footer className="shrink-0 border-t border-line p-3">
            {showQuick && (
              <div className="mb-2 flex gap-1">
                {QUICK.map((e) => (
                  <button key={e} onClick={() => submit(e)} className="h-9 w-9 rounded-full bg-surface-2 text-[17px] hover:bg-surface-3" aria-label={`Send ${e}`}>
                    {e}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(text);
              }}
              className="flex items-center gap-2"
            >
              <button type="button" onClick={() => setShowQuick((v) => !v)} aria-pressed={showQuick} aria-label="Quick reactions" className="icon-btn h-10 w-10">
                <IconSmile size={19} />
              </button>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Say something to everyone watching…"
                aria-label="Message the match chat"
                maxLength={COMMUNITY_TEXT_MAX}
                className="field !py-2.5 text-[14px]"
              />
              <button type="submit" disabled={!text.trim()} aria-label="Send to match chat" className="icon-btn h-10 w-10 bg-info/20 !text-fg enabled:hover:bg-info/30 disabled:opacity-40">
                <IconSend size={17} />
              </button>
            </form>
            <p className="mt-1.5 inline-flex items-center gap-1 px-1 text-[11px] text-subtle">
              <IconGlobe size={11} /> Public — everyone watching this match can see it
            </p>
          </footer>
        </>
      )}
    </section>
  );
}
