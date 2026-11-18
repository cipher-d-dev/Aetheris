/**
 * SQLite persistence (react-native-quick-sqlite, WAL mode).
 * Everything here is synchronous: quick-sqlite's execute() is JSI-backed.
 */
import {open, QuickSQLiteConnection} from 'react-native-quick-sqlite';
import {CREATE_TABLES_SQL} from './schema';
import {GroupInfo, MediaAttachment, MessageStatus, ContentKind} from '../types/message';
import type {CarryRecord, MeshStore} from '../mesh/meshNode';

const SCHEMA_VERSION = 2;
const SEEN_RETENTION_MS = 72 * 60 * 60 * 1000;

let db: QuickSQLiteConnection | null = null;

export function getDb(): QuickSQLiteConnection {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

function rows(sql: string, params: any[] = []): any[] {
  return getDb().execute(sql, params).rows?._array ?? [];
}

function run(sql: string, params: any[] = []): void {
  getDb().execute(sql, params);
}

export async function initDatabase(): Promise<void> {
  if (db) return;
  db = open({name: 'aetheris.db'});

  const version = Number(rows('PRAGMA user_version')[0]?.user_version ?? 0);
  if (version < SCHEMA_VERSION) {
    // v1 (pre-mesh-rewrite) stored a different message format. It was never
    // released, so start clean rather than migrate.
    for (const t of ['messages', 'seen_message_ids']) run(`DROP TABLE IF EXISTS ${t}`);
  }

  for (const sql of CREATE_TABLES_SQL.split(';').map(s => s.trim()).filter(Boolean)) {
    run(sql);
  }
  run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  ensureColumn('peers', 'verified', 'INTEGER DEFAULT 0');
  ensureColumn('peers', 'nickname', 'TEXT');

  run('DELETE FROM seen_message_ids WHERE seen_at < ?', [Date.now() - SEEN_RETENTION_MS]);
  run('DELETE FROM carried_messages WHERE expires_at < ?', [Date.now()]);
}

function ensureColumn(table: string, column: string, definition: string): void {
  const exists = rows(`PRAGMA table_info(${table})`).some((r: any) => r.name === column);
  if (!exists) run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function dbGetSetting(key: string): string | null {
  return rows('SELECT value FROM settings WHERE key = ?', [key])[0]?.value ?? null;
}

export function dbSetSetting(key: string, value: string): void {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  senderAlias?: string;
  kind: ContentKind;
  text: string;
  media?: MediaAttachment;
  status: MessageStatus;
  isOutbound: boolean;
  route?: string[];
  createdAt: number;
  expiresAt?: number;
}

export function dbInsertMessage(m: MessageRow & {read?: boolean}): void {
  run(
    `INSERT OR IGNORE INTO messages
       (id, conversation_id, sender_id, recipient_id, sender_alias, kind, text, media,
        status, is_outbound, route, created_at, expires_at, read)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.id,
      m.conversationId,
      m.senderId,
      m.recipientId,
      m.senderAlias ?? null,
      m.kind,
      m.text,
      m.media ? JSON.stringify(m.media) : null,
      m.status,
      m.isOutbound ? 1 : 0,
      m.route ? JSON.stringify(m.route) : null,
      m.createdAt,
      m.expiresAt ?? null,
      m.read === false ? 0 : 1,
    ],
  );
}

export function dbUpdateMessageStatus(id: string, status: MessageStatus, route?: string[]): void {
  if (route) {
    run('UPDATE messages SET status = ?, route = ? WHERE id = ?', [status, JSON.stringify(route), id]);
  } else {
    run('UPDATE messages SET status = ? WHERE id = ?', [status, id]);
  }
}

export function dbGetMessageStatus(id: string): MessageStatus | null {
  return rows('SELECT status FROM messages WHERE id = ?', [id])[0]?.status ?? null;
}

export function dbGetConversation(conversationId: string, limit = 300): MessageRow[] {
  return rows(
    `SELECT * FROM (
       SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?
     ) ORDER BY created_at ASC`,
    [conversationId, limit],
  ).map(rowToMessage);
}

export function dbMarkConversationRead(conversationId: string): void {
  run('UPDATE messages SET read = 1 WHERE conversation_id = ?', [conversationId]);
}

export interface ConversationRow {
  id: string;
  lastText: string;
  lastKind: ContentKind;
  lastTime: number;
  unread: number;
}

export function dbListConversations(): ConversationRow[] {
  return rows(
    `SELECT m.conversation_id AS id, m.text AS last_text, m.kind AS last_kind,
            m.created_at AS last_time,
            (SELECT COUNT(*) FROM messages u WHERE u.conversation_id = m.conversation_id AND u.read = 0) AS unread
       FROM messages m
       JOIN (SELECT conversation_id, MAX(created_at) AS t FROM messages GROUP BY conversation_id) latest
         ON latest.conversation_id = m.conversation_id AND latest.t = m.created_at
      GROUP BY m.conversation_id
      ORDER BY m.created_at DESC`,
  ).map(r => ({
    id: r.id,
    lastText: r.last_text ?? '',
    lastKind: (r.last_kind ?? 'text') as ContentKind,
    lastTime: r.last_time,
    unread: r.unread ?? 0,
  }));
}

export function dbDeleteConversation(conversationId: string): void {
  run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
}

/** Our own messages that are still waiting for an ACK (for UI only). */
export function dbPendingOutboundIds(): string[] {
  return rows(`SELECT id FROM messages WHERE is_outbound = 1 AND status IN ('pending','sent')`).map(
    r => r.id,
  );
}

function rowToMessage(r: any): MessageRow {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    recipientId: r.recipient_id,
    senderAlias: r.sender_alias ?? undefined,
    kind: (r.kind ?? 'text') as ContentKind,
    text: r.text ?? '',
    media: r.media ? safeJson(r.media) : undefined,
    status: r.status as MessageStatus,
    isOutbound: r.is_outbound === 1,
    route: r.route ? safeJson(r.route) : undefined,
    createdAt: r.created_at,
    expiresAt: r.expires_at ?? undefined,
  };
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// ─── Peers (contacts we've met or heard about) ───────────────────────────────

export interface PeerRow {
  id: string;
  /** Name the person chose for themselves */
  alias?: string;
  /** Name you gave them (overrides alias, only on this phone) */
  nickname?: string;
  /** You scanned their QR code in person */
  verified: boolean;
  lastSeen: number;
}

function rowToPeer(r: any): PeerRow {
  return {
    id: r.id,
    alias: r.alias ?? undefined,
    nickname: r.nickname ?? undefined,
    verified: r.verified === 1,
    lastSeen: r.last_seen ?? 0,
  };
}

export function dbUpsertPeer(id: string, alias?: string): void {
  run(
    `INSERT INTO peers (id, alias, last_seen) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen,
       alias = COALESCE(excluded.alias, peers.alias)`,
    [id, alias ?? null, Date.now()],
  );
}

export function dbGetPeer(id: string): PeerRow | null {
  const r = rows('SELECT * FROM peers WHERE id = ?', [id])[0];
  return r ? rowToPeer(r) : null;
}

export function dbListPeers(): PeerRow[] {
  return rows('SELECT * FROM peers ORDER BY verified DESC, last_seen DESC').map(rowToPeer);
}

/** Add someone from a QR code / link. Scanning in person marks them verified. */
export function dbAddContact(id: string, alias: string | undefined, verified: boolean): void {
  dbUpsertPeer(id, alias);
  if (verified) run('UPDATE peers SET verified = 1 WHERE id = ?', [id]);
}

export function dbSetNickname(id: string, nickname: string): void {
  dbUpsertPeer(id);
  const clean = nickname.trim().slice(0, 32);
  run('UPDATE peers SET nickname = ? WHERE id = ?', [clean || null, id]);
}

/**
 * Resolve user input (full Base58 key, or the XXXX-XXXX short ID shown on the
 * Identity screen) to a full node ID. Returns null if unknown.
 */
export function dbResolvePeerId(input: string): string | null {
  const cleaned = input.trim().replace(/[-\s]+/g, '');
  if (cleaned.length >= 32) return cleaned;
  if (cleaned.length < 4) return null;
  const matches = rows('SELECT id FROM peers ORDER BY last_seen DESC').filter((r: any) =>
    String(r.id).toUpperCase().startsWith(cleaned.toUpperCase()),
  );
  return matches[0]?.id ?? null;
}

// ─── Groups ──────────────────────────────────────────────────────────────────

export function dbUpsertGroup(g: GroupInfo): void {
  run(
    `INSERT INTO groups (id, name, members, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, members = excluded.members`,
    [g.id, g.name, JSON.stringify(g.members), Date.now()],
  );
}

export function dbGetGroup(id: string): GroupInfo | null {
  const r = rows('SELECT * FROM groups WHERE id = ?', [id])[0];
  return r ? {id: r.id, name: r.name, members: safeJson(r.members) ?? []} : null;
}

export function dbListGroups(): GroupInfo[] {
  return rows('SELECT * FROM groups').map(r => ({
    id: r.id,
    name: r.name,
    members: safeJson(r.members) ?? [],
  }));
}

export function dbAddGroupDelivery(subId: string, messageId: string, memberId: string): void {
  run(
    'INSERT OR IGNORE INTO group_deliveries (sub_id, message_id, member_id) VALUES (?, ?, ?)',
    [subId, messageId, memberId],
  );
}

/** Returns the parent message ID if `subId` belongs to a group fan-out. */
export function dbGroupParent(subId: string): string | null {
  return rows('SELECT message_id FROM group_deliveries WHERE sub_id = ?', [subId])[0]?.message_id ?? null;
}

export function dbMarkGroupDelivered(subId: string): {delivered: number; total: number} {
  run('UPDATE group_deliveries SET delivered = 1 WHERE sub_id = ?', [subId]);
  const parent = dbGroupParent(subId);
  const r = rows(
    'SELECT SUM(delivered) AS d, COUNT(*) AS t FROM group_deliveries WHERE message_id = ?',
    [parent],
  )[0];
  return {delivered: r?.d ?? 0, total: r?.t ?? 0};
}

export function dbGroupDeliveryCounts(messageId: string): {delivered: number; total: number} {
  const r = rows(
    'SELECT SUM(delivered) AS d, COUNT(*) AS t FROM group_deliveries WHERE message_id = ?',
    [messageId],
  )[0];
  return {delivered: r?.d ?? 0, total: r?.t ?? 0};
}

// ─── Mesh store (dedup cache + carried messages) ─────────────────────────────

export const dbMeshStore: MeshStore = {
  hasSeen: key => rows('SELECT 1 FROM seen_message_ids WHERE message_id = ?', [key]).length > 0,
  markSeen: key =>
    run('INSERT OR IGNORE INTO seen_message_ids (message_id, seen_at) VALUES (?, ?)', [key, Date.now()]),
  carryPut: (rec: CarryRecord) =>
    run(
      `INSERT INTO carried_messages (id, record, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET record = excluded.record`,
      [rec.message.id, JSON.stringify(rec), rec.message.routing.expiresAt],
    ),
  carryRemove: id => run('DELETE FROM carried_messages WHERE id = ?', [id]),
  carryList: () =>
    rows('SELECT record FROM carried_messages').map(r => safeJson(r.record)).filter(Boolean),
};

export function dbGetMessageConversation(id: string): string | null {
  return rows('SELECT conversation_id FROM messages WHERE id = ?', [id])[0]?.conversation_id ?? null;
}
