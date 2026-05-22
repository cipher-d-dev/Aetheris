/**
 * messages.ts
 * Database operations for messages and conversations.
 */

import {getDb} from './database';
import {LocalMessage, MessageStatus} from '../types/message';

/**
 * Insert a new outbound or inbound message into the database.
 */
export function insertMessage(msg: {
  id: string;
  senderId: string;
  recipientId: string;
  encryptedPayload: string;
  nonce: string;
  ephemeralPublicKey: string;
  signature: string;
  isOutbound: boolean;
  ttl: number;
  expiresAt: number;
  text?: string;
}): void {
  getDb().execute(
    `INSERT OR IGNORE INTO messages
      (id, sender_id, recipient_id, encrypted_payload, nonce,
       ephemeral_public_key, signature, is_outbound, ttl,
       hop_count, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?)`,
    [
      msg.id,
      msg.senderId,
      msg.recipientId,
      msg.encryptedPayload,
      msg.nonce,
      msg.ephemeralPublicKey,
      msg.signature,
      msg.isOutbound ? 1 : 0,
      msg.ttl,
      Date.now(),
      msg.expiresAt,
    ],
  );
}

/**
 * Update the delivery status of a message.
 */
export function updateMessageStatus(id: string, status: MessageStatus): void {
  getDb().execute('UPDATE messages SET status = ? WHERE id = ?', [status, id]);
}

/**
 * Get all messages in a conversation with a specific peer.
 * Returns most recent last (ascending by created_at).
 */
export function getConversation(
  myId: string,
  peerId: string,
  limit = 100,
): LocalMessage[] {
  const result = getDb().execute(
    `SELECT * FROM messages
     WHERE (sender_id = ? AND recipient_id = ?)
        OR (sender_id = ? AND recipient_id = ?)
     ORDER BY created_at ASC
     LIMIT ?`,
    [myId, peerId, peerId, myId, limit],
  );

  return (result.rows?._array ?? []).map(rowToLocalMessage);
}

/**
 * Get a list of unique conversations (one row per peer, most recent first).
 * Used for the Messages screen conversation list.
 */
export function getConversationList(myId: string): ConversationSummary[] {
  const result = getDb().execute(
    `SELECT
       CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END AS peer_id,
       MAX(created_at) AS last_time,
       COUNT(*) AS message_count
     FROM messages
     WHERE sender_id = ? OR recipient_id = ?
     GROUP BY peer_id
     ORDER BY last_time DESC`,
    [myId, myId, myId],
  );

  return (result.rows?._array ?? []).map(row => ({
    peerId: row.peer_id as string,
    lastTime: row.last_time as number,
    messageCount: row.message_count as number,
  }));
}

/**
 * Get a single message by ID.
 */
export function getMessageById(id: string): LocalMessage | null {
  const result = getDb().execute('SELECT * FROM messages WHERE id = ?', [id]);
  const row = result.rows?._array?.[0];
  return row ? rowToLocalMessage(row) : null;
}

/**
 * Get all pending outbound messages — used by the relay layer.
 */
export function getPendingOutboundMessages(): LocalMessage[] {
  const result = getDb().execute(
    `SELECT * FROM messages
     WHERE status = 'pending' AND is_outbound = 1
       AND expires_at > ?`,
    [Date.now()],
  );
  return (result.rows?._array ?? []).map(rowToLocalMessage);
}

/**
 * Delete messages that have passed their expiry time.
 */
export function purgeExpiredMessages(): void {
  getDb().execute('DELETE FROM messages WHERE expires_at < ?', [Date.now()]);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConversationSummary {
  peerId: string;
  lastTime: number;
  messageCount: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function rowToLocalMessage(row: Record<string, unknown>): LocalMessage {
  return {
    id: row.id as string,
    senderId: row.sender_id as string,
    recipientId: row.recipient_id as string,
    encryptedPayload: row.encrypted_payload as string,
    nonce: row.nonce as string,
    ephemeralPublicKey: row.ephemeral_public_key as string,
    signature: row.signature as string,
    status: row.status as MessageStatus,
    ttl: row.ttl as number,
    hopCount: row.hop_count as number,
    isOutbound: row.is_outbound === 1,
    createdAt: row.created_at as number,
    expiresAt: row.expires_at as number,
  };
}
