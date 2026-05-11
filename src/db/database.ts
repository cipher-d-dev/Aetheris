import {open, QuickSQLiteConnection} from 'react-native-quick-sqlite';
import {CREATE_TABLES_SQL} from './schema';

let db: QuickSQLiteConnection | null = null;

export function getDb(): QuickSQLiteConnection {
  if (!db)
    throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export async function initDatabase(): Promise<void> {
  db = open({name: 'aetheris.db'});

  // Execute each statement separately (quick-sqlite doesn't support multi-statement strings)
  const statements = CREATE_TABLES_SQL.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const sql of statements) {
    db.execute(sql);
  }

  console.log('[DB] Database initialized');
}

// Convenience wrappers
export function dbInsertMessage(msg: {
  id: string;
  sender_id: string;
  recipient_id: string;
  encrypted_payload: string;
  nonce: string;
  ephemeral_public_key: string;
  signature: string;
  is_outbound: number;
  ttl: number;
  expires_at: number;
}): void {
  getDb().execute(
    `INSERT OR IGNORE INTO messages 
      (id, sender_id, recipient_id, encrypted_payload, nonce, ephemeral_public_key, 
       signature, is_outbound, ttl, hop_count, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?)`,
    [
      msg.id,
      msg.sender_id,
      msg.recipient_id,
      msg.encrypted_payload,
      msg.nonce,
      msg.ephemeral_public_key,
      msg.signature,
      msg.is_outbound,
      msg.ttl,
      Date.now(),
      msg.expires_at,
    ],
  );
}

export function dbHasSeenMessage(messageId: string): boolean {
  const result = getDb().execute(
    'SELECT 1 FROM seen_message_ids WHERE message_id = ?',
    [messageId],
  );
  return (result.rows?._array?.length ?? 0) > 0;
}

export function dbMarkMessageSeen(messageId: string): void {
  getDb().execute(
    'INSERT OR IGNORE INTO seen_message_ids (message_id, seen_at) VALUES (?, ?)',
    [messageId, Date.now()],
  );
}

export function dbUpsertPeer(id: string, rssi: number): void {
  getDb().execute(
    `INSERT INTO peers (id, last_seen, rssi) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, rssi = excluded.rssi`,
    [id, Date.now(), rssi],
  );
}
