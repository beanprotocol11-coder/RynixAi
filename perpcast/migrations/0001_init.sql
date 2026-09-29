-- Perpcast social schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,              -- lowercase wallet address
  address TEXT NOT NULL,            -- address as presented by the wallet
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL DEFAULT '',
  pfp TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS casts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  channel TEXT,                     -- channel id or market:<COIN>
  parent_id TEXT REFERENCES casts(id) ON DELETE CASCADE,
  quote_id TEXT REFERENCES casts(id) ON DELETE SET NULL,
  images TEXT NOT NULL DEFAULT '[]',
  position TEXT,                    -- JSON PositionEmbed
  like_count INTEGER NOT NULL DEFAULT 0,
  recast_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS casts_time ON casts(created_at DESC);
CREATE INDEX IF NOT EXISTS casts_author ON casts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS casts_channel ON casts(channel, created_at DESC);
CREATE INDEX IF NOT EXISTS casts_parent ON casts(parent_id, created_at);

CREATE TABLE IF NOT EXISTS reactions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cast_id TEXT NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('like', 'recast')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, cast_id, kind)
);
CREATE INDEX IF NOT EXISTS reactions_cast ON reactions(cast_id, kind);
CREATE INDEX IF NOT EXISTS reactions_user ON reactions(user_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee ON follows(followee_id);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- recipient
  kind TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cast_id TEXT REFERENCES casts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS activity_user ON activity(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_pair ON messages(from_id, to_id, created_at);
CREATE INDEX IF NOT EXISTS messages_to ON messages(to_id, created_at);

CREATE TABLE IF NOT EXISTS dm_reads (
  user_id TEXT NOT NULL,
  peer_id TEXT NOT NULL,
  read_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, peer_id)
);
