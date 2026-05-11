export const CREATE_TABLES_SQL = `
  PRAGMA journal_mode=WAL;

  CREATE TABLE IF NOT EXISTS identity (
    id TEXT PRIMARY KEY,
    alias TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    encrypted_payload TEXT NOT NULL,
    nonce TEXT NOT NULL,
    ephemeral_public_key TEXT NOT NULL,
    signature TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    ttl INTEGER DEFAULT 7,
    hop_count INTEGER DEFAULT 0,
    is_outbound INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS peers (
    id TEXT PRIMARY KEY,
    alias TEXT,
    last_seen INTEGER,
    rssi INTEGER,
    is_trusted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS seen_message_ids (
    message_id TEXT PRIMARY KEY,
    seen_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
  CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
  CREATE INDEX IF NOT EXISTS idx_seen_messages_time ON seen_message_ids(seen_at);
`;
