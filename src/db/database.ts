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

  ensureColumn('messages', 'serialized_message', 'TEXT');

  console.log('[DB] Database initialized');
}

function ensureColumn(table: string, column: string, definition: string): void {
  if (!db) return;
  const result = db.execute(`PRAGMA table_info(${table})`);
  const rows = result.rows?._array ?? [];
  const exists = rows.some((row: any) => row.name === column);
  if (!exists) {
    db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Convenience wrappers
export function dbInsertMessage(msg: {
  id: string;
  sender_id: string;
  recipient_id: string;
  encrypted_payload: string;
  serialized_message?: string;
  nonce: string;
  ephemeral_public_key: string;
  signature: string;
  is_outbound: number;
  ttl: number;
  expires_at: number;
  status?: 'pending' | 'sent' | 'delivered' | 'failed';
  text?: string;
}): void {
  getDb().execute(
    `INSERT OR IGNORE INTO messages 
      (id, sender_id, recipient_id, encrypted_payload, serialized_message, nonce, ephemeral_public_key, 
       signature, is_outbound, ttl, hop_count, status, created_at, expires_at, text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    [
      msg.id,
      msg.sender_id,
      msg.recipient_id,
      msg.encrypted_payload,
      msg.serialized_message || null,
      msg.nonce,
      msg.ephemeral_public_key,
      msg.signature,
      msg.is_outbound,
      msg.ttl,
      msg.status || 'pending',
      Date.now(),
      msg.expires_at,
      msg.text || null,
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

/**
 * Resolve a peer identifier to its full public key.
 * 
 * Accepts:
 * - Full Base58 public key (>= 32 chars)
 * - Short ID format (XXXX-XXXX or 8 chars)
 * 
 * Returns the full public key, or null if not found.
 */
export function dbResolvePeerId(peerIdInput: string): string | null {
  const normalized = peerIdInput.trim();
  const cleaned = normalized.replace(/[-\s]+/g, '');

  // If the input is a full public key, strip separators and preserve casing.
  if (cleaned.length >= 32) {
    return cleaned;
  }

  // If it's short ID format (XXXX-XXXX or 8 chars), look it up in peers table.
  const shortPattern = cleaned.toUpperCase();

  try {
    const result = getDb().execute(
      `SELECT id FROM peers WHERE id LIKE ? ORDER BY last_seen DESC LIMIT 1`,
      [`${shortPattern}%`], // Starts with short ID
    );

    if (result.rows?._array?.length) {
      return result.rows._array[0].id;
    }
  } catch (e) {
    console.warn('[DB] Peer lookup failed:', e);
  }

  return null;
}

/**
 * Delete all messages in a conversation with a specific peer.
 */
export function dbDeleteConversation(myId: string, peerId: string): void {
  getDb().execute(
    `DELETE FROM messages
     WHERE (sender_id = ? AND recipient_id = ?)
        OR (sender_id = ? AND recipient_id = ?)`,
    [myId, peerId, peerId, myId],
  );
}
