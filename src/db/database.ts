/**
 * SQLite persistence (react-native-quick-sqlite, WAL mode).
 * Everything here is synchronous: quick-sqlite's execute() is JSI-backed.
 */
import {open, QuickSQLiteConnection} from 'react-native-quick-sqlite';
import {CREATE_TABLES_SQL} from './schema';
import {GroupInfo, MediaAttachment, MessageStatus, ContentKind, ReplyRef} from '../types/message';
import {MESSAGE_TTL_MS} from '../crypto/messageBuilder';
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
  ensureColumn('group_deliveries', 'expired', 'INTEGER DEFAULT 0');
  ensureColumn('messages', 'received_at', 'INTEGER');
  ensureColumn('messages', 'ref_id', 'TEXT');
  ensureColumn('messages', 'reply_to', 'TEXT');
  run('CREATE INDEX IF NOT EXISTS idx_messages_ref ON messages(conversation_id, ref_id)');
  // Rows from before ref_id existed take their own id. Old inbound group rows are
  // stored under a per-member id and the shared id was never saved, so they can't be recovered.
  run('UPDATE messages SET ref_id = id WHERE ref_id IS NULL');

  run('DELETE FROM seen_message_ids WHERE seen_at < ?', [Date.now() - SEEN_RETENTION_MS]);
  run('DELETE FROM carried_messages WHERE expires_at < ?', [Date.now()]);
  dbExpireOverdueOutbound(Date.now());
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

export function dbListSettings(prefix: string): {key: string; value: string}[] {
  return rows("SELECT key, value FROM settings WHERE substr(key, 1, ?) = ?", [prefix.length, prefix]);
}

export function dbDeleteSetting(key: string): void {
  run('DELETE FROM settings WHERE key = ?', [key]);
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface MessageRow {
  id: string;
  /**
   * Id every phone in the conversation agrees on, for replies and reactions.
   * 1:1: the mesh message id. Groups: the groupMessageId shared by all copies.
   */
  refId: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  senderAlias?: string;
  kind: ContentKind;
  text: string;
  media?: MediaAttachment;
  replyTo?: ReplyRef;
  status: MessageStatus;
  isOutbound: boolean;
  route?: string[];
  createdAt: number;
  /** When an inbound message reached this phone. Unset means the same as createdAt. */
  receivedAt?: number;
  expiresAt?: number;
}

export function dbInsertMessage(m: Omit<MessageRow, 'refId'> & {refId?: string; read?: boolean}): void {
  run(
    `INSERT OR IGNORE INTO messages
       (id, ref_id, conversation_id, sender_id, recipient_id, sender_alias, kind, text, media,
        status, is_outbound, route, created_at, received_at, expires_at, read, reply_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.id,
      m.refId ?? m.id,
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
      m.receivedAt ?? null,
      m.expiresAt ?? null,
      m.read === false ? 0 : 1,
      m.replyTo ? JSON.stringify(m.replyTo) : null,
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

/** The earliest unread inbound message (by created_at, so late arrivals count) and how many are unread. */
export function dbFirstUnread(conversationId: string): {id: string; count: number} | null {
  const r = rows(
    `SELECT id, (SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND is_outbound = 0 AND read = 0) AS n
     FROM messages WHERE conversation_id = ? AND is_outbound = 0 AND read = 0
     ORDER BY created_at ASC LIMIT 1`,
    [conversationId, conversationId],
  )[0];
  return r ? {id: r.id, count: r.n} : null;
}

export interface ConversationRow {
  id: string;
  /** Status of the last message if we sent it (for ticks in the list) */
  lastOutboundStatus?: MessageStatus;
  lastText: string;
  lastKind: ContentKind;
  lastTime: number;
  unread: number;
}

export function dbListConversations(): ConversationRow[] {
  return rows(
    `SELECT m.conversation_id AS id, m.text AS last_text, m.kind AS last_kind,
            COALESCE(m.received_at, m.created_at) AS last_time, m.is_outbound AS last_out, m.status AS last_status,
            (SELECT COUNT(*) FROM messages u WHERE u.conversation_id = m.conversation_id AND u.read = 0) AS unread
       FROM messages m
       JOIN (SELECT conversation_id, MAX(COALESCE(received_at, created_at)) AS t FROM messages GROUP BY conversation_id) latest
         ON latest.conversation_id = m.conversation_id AND latest.t = COALESCE(m.received_at, m.created_at)
      GROUP BY m.conversation_id
      ORDER BY last_time DESC`,
  ).map(r => ({
    id: r.id,
    lastOutboundStatus: r.last_out === 1 ? (r.last_status as MessageStatus) : undefined,
    lastText: r.last_text ?? '',
    lastKind: (r.last_kind ?? 'text') as ContentKind,
    lastTime: r.last_time,
    unread: r.unread ?? 0,
  }));
}

export function dbFindByRef(conversationId: string, refId: string): MessageRow | null {
  const r = rows('SELECT * FROM messages WHERE conversation_id = ? AND ref_id = ? LIMIT 1', [conversationId, refId])[0];
  return r ? rowToMessage(r) : null;
}

export function dbGetMessage(id: string): MessageRow | null {
  const r = rows('SELECT * FROM messages WHERE id = ?', [id])[0];
  return r ? rowToMessage(r) : null;
}

/** Delete one message on this phone. Returns group sub-IDs that were in flight. */
export function dbDeleteMessage(id: string): string[] {
  const subs = rows('SELECT sub_id FROM group_deliveries WHERE message_id = ?', [id]).map(r => r.sub_id);
  run('DELETE FROM group_deliveries WHERE message_id = ?', [id]);
  run('DELETE FROM messages WHERE id = ?', [id]);
  return subs;
}

/** Delete a conversation on this phone. Returns the ids of in-flight messages (and group sub-IDs) to cancel. */
export function dbDeleteConversation(conversationId: string): string[] {
  const ids = rows(
    `SELECT id FROM messages WHERE conversation_id = ? AND is_outbound = 1 AND status IN ('pending','sent')`,
    [conversationId],
  ).map(r => r.id);
  const subs = rows(
    `SELECT sub_id FROM group_deliveries
      WHERE delivered = 0 AND message_id IN (SELECT id FROM messages WHERE conversation_id = ?)`,
    [conversationId],
  ).map(r => r.sub_id);
  run(
    'DELETE FROM group_deliveries WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = ?)',
    [conversationId],
  );
  run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
  run('DELETE FROM reactions WHERE conversation_id = ?', [conversationId]);
  return [...ids, ...subs];
}

export interface ReactionRow {
  emoji: string;
  reactorId: string;
}

/**
 * Set (or, with emoji '', remove) one person's reaction to a message. Mesh messages
 * can arrive out of order, so an older reaction never replaces a newer one. A removal
 * is kept as an empty-emoji row so a stale reaction arriving later can't bring it back.
 */
export function dbSetReaction(
  conversationId: string,
  messageRef: string,
  reactorId: string,
  emoji: string,
  createdAt: number,
): void {
  run(
    `INSERT INTO reactions (message_ref, conversation_id, reactor_id, emoji, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(message_ref, reactor_id) DO UPDATE SET
       conversation_id = excluded.conversation_id, emoji = excluded.emoji, created_at = excluded.created_at
     WHERE excluded.created_at >= reactions.created_at`,
    [messageRef, conversationId, reactorId, emoji, createdAt],
  );
}

export function dbReactionsFor(conversationId: string): Record<string, ReactionRow[]> {
  const out: Record<string, ReactionRow[]> = {};
  for (const r of rows(
    `SELECT message_ref, reactor_id, emoji FROM reactions
      WHERE conversation_id = ? AND emoji != '' ORDER BY created_at`,
    [conversationId],
  )) {
    (out[r.message_ref] ??= []).push({emoji: r.emoji, reactorId: r.reactor_id});
  }
  return out;
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
    refId: r.ref_id ?? r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    recipientId: r.recipient_id,
    senderAlias: r.sender_alias ?? undefined,
    kind: (r.kind ?? 'text') as ContentKind,
    text: r.text ?? '',
    media: r.media ? safeJson(r.media) : undefined,
    replyTo: r.reply_to ? safeJson(r.reply_to) : undefined,
    status: r.status as MessageStatus,
    isOutbound: r.is_outbound === 1,
    route: r.route ? safeJson(r.route) : undefined,
    createdAt: r.created_at,
    receivedAt: r.received_at ?? undefined,
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

/** Per-member delivery state of a group message, for naming who is still waiting. */
export function dbGroupDeliveries(messageId: string): {memberId: string; delivered: boolean; expired: boolean}[] {
  return rows('SELECT member_id, delivered, expired FROM group_deliveries WHERE message_id = ?', [messageId]).map(r => ({
    memberId: r.member_id,
    delivered: !!r.delivered,
    expired: !!r.expired,
  }));
}

/**
 * Marks one per-member copy as expired and reports whether the group message
 * as a whole has failed: every copy is delivered or expired, and none delivered.
 * A partly delivered message keeps its status ("sent").
 */
export function dbExpireGroupCopy(subId: string): {parent: string | null; failed: boolean} {
  run('UPDATE group_deliveries SET expired = 1 WHERE sub_id = ? AND delivered = 0', [subId]);
  const parent = dbGroupParent(subId);
  if (!parent) return {parent: null, failed: false};
  return {parent, failed: groupFailed(parent)};
}

function groupFailed(messageId: string): boolean {
  const r = rows(
    `SELECT COUNT(*) AS t, SUM(delivered) AS d, SUM(CASE WHEN delivered = 0 AND expired = 1 THEN 1 ELSE 0 END) AS e
       FROM group_deliveries WHERE message_id = ?`,
    [messageId],
  )[0];
  return !!r && r.t > 0 && !r.d && r.e === r.t;
}

/**
 * Startup sweep: outbound messages past their lifetime that expired while the
 * app was closed. Group copies are marked expired, and the parent fails only
 * if nothing was delivered.
 */
export function dbExpireOverdueOutbound(now: number): void {
  const overdue = rows(
    "SELECT id FROM messages WHERE is_outbound = 1 AND status IN ('pending', 'sent') AND created_at < ?",
    [now - MESSAGE_TTL_MS],
  );
  for (const {id} of overdue) {
    run('UPDATE group_deliveries SET expired = 1 WHERE message_id = ? AND delivered = 0', [id]);
    const isGroup = rows('SELECT 1 AS x FROM group_deliveries WHERE message_id = ?', [id]).length > 0;
    if (!isGroup || groupFailed(id)) dbUpdateMessageStatus(id, 'failed');
  }
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
