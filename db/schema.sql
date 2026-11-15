-- Sports Friend prototype schema (Neon Postgres). Idempotent.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,               -- anonymous id from cookie
  display_name  TEXT,
  onboarded     BOOLEAN NOT NULL DEFAULT FALSE,
  clock_offset_days INTEGER NOT NULL DEFAULT 0, -- demo "come back later" control
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Typed, evolving memory. One row per remembered thing.
CREATE TABLE IF NOT EXISTS memories (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL CHECK (kind IN ('stated_preference','inferred_interest','knowledge','shared_discovery')),
  subject_entity     TEXT,                       -- e.g. player:ms-dhoni (nullable for free-form knowledge)
  content            TEXT NOT NULL,              -- human-readable, shown on the memory page
  source             TEXT NOT NULL CHECK (source IN ('stated','inferred')),
  confidence         REAL NOT NULL DEFAULT 0.5,
  evidence_count     INTEGER NOT NULL DEFAULT 1,
  last_reinforced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','faded','corrected')),
  polarity           TEXT NOT NULL DEFAULT 'positive' CHECK (polarity IN ('positive','negative')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memories_user_idx ON memories(user_id, status);

-- Behaviour signals (no LLM involved).
CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,                     -- opened_story | picked_thread | follow_up | viewed_player | dismissed_nudge | asked_moment
  entity_id   TEXT,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_user_idx ON events(user_id, created_at DESC);

-- Conversation history across sessions.
CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content     TEXT NOT NULL,
  story       JSONB,                             -- story payload when the message is a story
  context     JSONB,                             -- page context at the time
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_user_idx ON messages(user_id, created_at DESC);

-- What the friend has already surfaced (novelty + rate limits).
CREATE TABLE IF NOT EXISTS discoveries (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id   TEXT NOT NULL,
  angle       TEXT,
  surface     TEXT NOT NULL,                     -- home | match | player | chat | moment
  session_id  TEXT,
  outcome     TEXT,                              -- opened | dismissed | ignored
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discoveries_user_idx ON discoveries(user_id, created_at DESC);

-- The fan's fantasy team (entity ids, or "name:<Player>" for players outside the dataset).
CREATE TABLE IF NOT EXISTS fantasy_picks (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pick_key   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pick_key)
);
