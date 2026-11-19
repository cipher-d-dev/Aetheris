export const CREATE_TABLES_SQL = `
  PRAGMA journal_mode=WAL;

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    sender_alias TEXT,
    kind TEXT DEFAULT 'text',
    text TEXT,
    media TEXT,
    status TEXT DEFAULT 'pending',
    is_outbound INTEGER DEFAULT 0,
    route TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    read INTEGER DEFAULT 1
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

  CREATE TABLE IF NOT EXISTS carried_messages (
    id TEXT PRIMARY KEY,
    record TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    members TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_deliveries (
    sub_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    delivered INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS reactions (
    message_ref TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    reactor_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (message_ref, reactor_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_seen_messages_time ON seen_message_ids(seen_at);
  CREATE INDEX IF NOT EXISTS idx_reactions_conversation ON reactions(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_group_deliveries_msg ON group_deliveries(message_id);
`;
