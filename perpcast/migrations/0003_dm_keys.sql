-- End-to-end encrypted DMs: each account publishes an X25519 public key; the private half never leaves the device.
ALTER TABLE users ADD COLUMN dm_key TEXT NOT NULL DEFAULT '';
