export type MemoryKind = "stated_preference" | "inferred_interest" | "knowledge" | "shared_discovery";
export type MemorySource = "stated" | "inferred";
export type MemoryStatus = "active" | "faded" | "corrected";
export type Polarity = "positive" | "negative";

export type Memory = {
  id: string;
  user_id: string;
  kind: MemoryKind;
  subject_entity: string | null;
  content: string;
  source: MemorySource;
  confidence: number;
  evidence_count: number;
  last_reinforced_at: string; // ISO
  status: MemoryStatus;
  polarity: Polarity;
  created_at: string; // ISO
};

export type User = {
  id: string;
  display_name: string | null;
  onboarded: boolean;
  clock_offset_days: number;
  created_at: string;
};

export type EventType =
  | "opened_story"
  | "picked_thread"
  | "follow_up"
  | "viewed_player"
  | "dismissed_nudge"
  | "asked_moment"
  | "fantasy_pick";

export type AppEvent = {
  user_id: string;
  type: EventType;
  entity_id: string | null;
  payload?: unknown;
  created_at: string;
};

export type StoredMessage = {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  story: unknown | null;
  context: unknown | null;
  created_at: string;
};

export type Surface = "home" | "match" | "player" | "chat" | "moment" | "live";

export type Discovery = {
  user_id: string;
  entity_id: string;
  angle: string | null;
  surface: Surface;
  session_id: string | null;
  outcome: "shown" | "opened" | "dismissed" | null;
  created_at: string;
};

export interface Store {
  ensureUser(id: string): Promise<User>;
  updateUser(id: string, patch: Partial<Pick<User, "display_name" | "onboarded" | "clock_offset_days">>): Promise<void>;
  resetUser(id: string): Promise<void>;

  listMemories(userId: string): Promise<Memory[]>;
  saveMemory(m: Memory): Promise<void>;
  deleteMemory(userId: string, id: string): Promise<void>;

  addEvent(e: AppEvent): Promise<void>;

  /** The fan's fantasy team: entity ids (or "name:<Player>" for players outside the dataset). */
  listPicks(userId: string): Promise<string[]>;
  setPick(userId: string, key: string, picked: boolean): Promise<void>;

  addMessage(m: Omit<StoredMessage, "id" | "created_at"> & { created_at?: string }): Promise<void>;
  recentMessages(userId: string, limit: number): Promise<StoredMessage[]>; // oldest → newest

  addDiscovery(d: Discovery): Promise<void>;
  listDiscoveries(userId: string, limit: number): Promise<Discovery[]>; // newest first
  setDiscoveryOutcome(userId: string, entityId: string, outcome: Discovery["outcome"]): Promise<void>;
}
