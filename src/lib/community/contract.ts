/**
 * Match community chat — the FRONTEND CONTRACT the backend needs to implement.
 *
 * Status: PROPOSED, not implemented. No /api/community routes exist yet. The UI runs on the mock adapter
 * (./mock.ts) unless NEXT_PUBLIC_COMMUNITY_API=on, which switches to ./api-adapter.ts and the endpoints below.
 *
 * The community is people talking to people. Buzzer never posts here and never replies to community messages;
 * a fan's private Buzzer conversation and memories never appear here.
 *
 * Proposed endpoints (all scoped to the current user via the existing sf_uid cookie):
 *
 *   GET  /api/community/:matchId/messages?before=<messageId>&limit=50
 *        → 200 CommunitySnapshot   (newest last; `before` pages back through history)
 *
 *   POST /api/community/:matchId/messages        body: { text: string (1–500), clientId: string }
 *        → 201 { message: CommunityMessage }     (clientId lets the UI reconcile its optimistic copy)
 *        → 429 { error } when rate-limited, 400 { error } when rejected by moderation
 *
 *   POST /api/community/:matchId/messages/:messageId/reactions   body: { emoji: string, on: boolean }
 *        → 200 { reactions: Reaction[] }
 *
 *   GET  /api/community/:matchId/stream          (Server-Sent Events)
 *        event: message   data: CommunityMessage
 *        event: reactions data: { messageId: string, reactions: Reaction[] }
 *        event: presence  data: Presence
 *
 * Open questions for the backend agent:
 * - Display names: reuse users.display_name, or a separate public handle chosen on first post?
 * - Moderation/profanity filter and per-user rate limits.
 * - Whether Buzzer may read recent public messages as context for the fan's PRIVATE answers (needs a user
 *   permission; PageContext would gain an optional `community` excerpt).
 */

export type Reaction = { emoji: string; count: number; /** the current user reacted */ mine: boolean };

export type CommunityAuthor = {
  id: string;
  name: string;
  /** Team the fan supports in this match, if they chose one (team entity id). */
  team?: string;
};

export type CommunityMessage = {
  id: string;
  matchId: string;
  author: CommunityAuthor;
  text: string;
  /** ISO timestamp */
  createdAt: string;
  reactions: Reaction[];
  /** Written by the current user. */
  mine?: boolean;
  /** Echo of the client's id for optimistic reconciliation. */
  clientId?: string;
};

export type Presence = { online: number };

export type CommunitySnapshot = { messages: CommunityMessage[]; presence: Presence; hasMore: boolean };

export type CommunityEvent =
  | { type: "message"; message: CommunityMessage }
  | { type: "reactions"; messageId: string; reactions: Reaction[] }
  | { type: "presence"; presence: Presence };

/** How the UI talks to a community backend. */
export interface CommunityAdapter {
  /** "mock" means sample data generated in the browser — nothing is sent anywhere. */
  readonly source: "api" | "mock";
  load(matchId: string): Promise<CommunitySnapshot>;
  subscribe(matchId: string, onEvent: (e: CommunityEvent) => void): () => void;
  post(matchId: string, text: string, clientId: string, me: CommunityAuthor): Promise<CommunityMessage>;
  react(matchId: string, messageId: string, emoji: string, on: boolean): Promise<Reaction[] | null>;
}

export const COMMUNITY_TEXT_MAX = 500;
