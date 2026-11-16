/**
 * MOCK community — sample fans and messages generated in the browser so the community UI can be built and
 * reviewed before the backend exists. Nothing here is sent anywhere or stored. The UI labels it as a preview.
 * Never import this from production code paths other than ./index.ts's fallback.
 */
import type { CommunityAdapter, CommunityAuthor, CommunityEvent, CommunityMessage, Reaction } from "./contract";

type Line = { who: number; text: string };

const FANS: Record<string, CommunityAuthor[]> = {
  basketball: [
    { id: "m1", name: "Maya R", team: "team:usa-basketball" },
    { id: "m2", name: "Théo", team: "team:france-basketball" },
    { id: "m3", name: "Jordan K", team: "team:usa-basketball" },
    { id: "m4", name: "Inès", team: "team:france-basketball" },
    { id: "m5", name: "Arjun" },
    { id: "m6", name: "Sam O" },
  ],
  cricket: [
    { id: "c1", name: "Priya S", team: "team:rcb" },
    { id: "c2", name: "Rahul", team: "team:rcb" },
    { id: "c3", name: "Karthik V" },
    { id: "c4", name: "Ananya", team: "team:rcb" },
    { id: "c5", name: "Dev M" },
    { id: "c6", name: "Zoya" },
  ],
};

// Generic fan talk: reactions, not facts, so the sample never puts false claims in front of anyone.
const LINES: Record<string, Line[]> = {
  basketball: [
    { who: 4, text: "Finally made it, what did I miss?" },
    { who: 0, text: "Just tip-off energy so far, you're good" },
    { who: 1, text: "Allez les Bleus 🇫🇷 this crowd is LOUD" },
    { who: 2, text: "That ball movement was gorgeous" },
    { who: 3, text: "Defence needs to wake up a bit" },
    { who: 5, text: "Can't believe how close this is" },
    { who: 0, text: "WHAT A SHOT 🔥🔥" },
    { who: 1, text: "Ok that was unreal, respect" },
    { who: 4, text: "This is the best game of the whole tournament" },
    { who: 2, text: "Timeout needed right now" },
    { who: 3, text: "Not over yet, one run and it's a game" },
    { who: 5, text: "My heart can't take this 😅" },
    { who: 0, text: "Ice cold." },
    { who: 4, text: "Rewatching this and still nervous lol" },
  ],
  cricket: [
    { who: 4, text: "Just joined, how's the pitch looking?" },
    { who: 0, text: "Bit of turn already, should be fun" },
    { who: 1, text: "Come onnn, keep it tight!" },
    { who: 2, text: "That was a beauty of a delivery" },
    { who: 3, text: "SHOT! Straight out of the middle 🔥" },
    { who: 5, text: "Field placement is so smart here" },
    { who: 0, text: "Need a wicket in the next two overs" },
    { who: 1, text: "Crowd is going mental 😂" },
    { who: 4, text: "Pressure is all on the chase now" },
    { who: 2, text: "Bowl it full and straight please" },
    { who: 3, text: "Can't watch, can't look away" },
    { who: 5, text: "What a finish this could be" },
  ],
};

const EMOJI = ["🔥", "👏", "😮", "😂"];

function sportFor(matchId: string): "basketball" | "cricket" {
  return /usa|fra|basket/i.test(matchId) ? "basketball" : "cricket";
}

function messageFrom(matchId: string, author: CommunityAuthor, text: string, minutesAgo: number, i: number): CommunityMessage {
  const reactions: Reaction[] = i % 3 === 0 ? [{ emoji: EMOJI[i % EMOJI.length], count: 1 + (i % 5), mine: false }] : [];
  return {
    id: `mock-${matchId}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    matchId,
    author,
    text,
    createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    reactions,
  };
}

export const mockAdapter: CommunityAdapter = {
  source: "mock",
  async load(matchId) {
    const sport = sportFor(matchId);
    const fans = FANS[sport];
    const lines = LINES[sport].slice(0, 6);
    const messages = lines.map((l, i) => messageFrom(matchId, fans[l.who], l.text, (lines.length - i) * 1.5, i));
    return { messages, presence: { online: 180 + Math.floor(Math.random() * 60) }, hasMore: false };
  },
  subscribe(matchId, onEvent: (e: CommunityEvent) => void) {
    const sport = sportFor(matchId);
    const fans = FANS[sport];
    const lines = LINES[sport];
    let i = 6;
    let timer = 0;
    const next = () => {
      timer = window.setTimeout(
        () => {
          const l = lines[i % lines.length];
          onEvent({ type: "message", message: messageFrom(matchId, fans[l.who], l.text, 0, i) });
          if (i % 2 === 0) onEvent({ type: "presence", presence: { online: 170 + Math.floor(Math.random() * 80) } });
          i++;
          next();
        },
        7000 + Math.random() * 9000,
      );
    };
    next();
    return () => window.clearTimeout(timer);
  },
  async post(matchId, text, clientId, me) {
    // Preview only: the message stays in this browser tab.
    await new Promise((r) => setTimeout(r, 250));
    return { id: `mock-own-${clientId}`, matchId, author: me, text, createdAt: new Date().toISOString(), reactions: [], mine: true, clientId };
  },
  async react() {
    return null; // the UI keeps its optimistic count
  },
};
