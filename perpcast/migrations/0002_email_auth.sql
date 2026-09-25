-- Email (OTP) sign-in. Users created this way have an `em_…` id and an empty address.

ALTER TABLE users ADD COLUMN email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_created ON users(created_at DESC);

CREATE TABLE IF NOT EXISTS email_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
