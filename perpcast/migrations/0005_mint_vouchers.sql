CREATE TABLE IF NOT EXISTS mint_vouchers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  wallet TEXT NOT NULL,
  contract TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  deadline INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mint_vouchers_created ON mint_vouchers (created_at);
CREATE INDEX IF NOT EXISTS idx_mint_vouchers_ip ON mint_vouchers (ip, created_at);
