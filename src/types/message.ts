/**
 * Core message types for the Aetheris mesh protocol.
 *
 * A MeshMessage is the single unit of data that flows through the network.
 * Every message is encrypted for the recipient and signed by the sender.
 * Relay nodes can read routing fields (sender, recipient, TTL) but never
 * the content — that stays encrypted.
 */

export type MessageStatus =
  | 'pending' // Created locally, not yet sent
  | 'sent' // Handed off to a connected peer
  | 'delivered' // Recipient ACK received
  | 'failed'; // Could not be delivered

export type MessageType = 'MSG' | 'ACK';

export interface EncryptedPayload {
  /** Base64 — ChaCha20-Poly1305 ciphertext */
  encrypted: string;
  /** Base64 — 24-byte random nonce */
  nonce: string;
  /** Base64 — ephemeral X25519 public key used for this message only */
  ephemeralPublicKey: string;
}

export interface RoutingInfo {
  /** Decremented at each hop. Message dropped when it reaches 0. */
  ttl: number;
  /** List of node IDs that have already relayed this message */
  hops: string[];
  /** Unix ms — set by sender, never changed during relay */
  originTimestamp: number;
  /** Unix ms — message silently dropped after this point */
  expiresAt: number;
}

export interface MeshMessage {
  /** UUID v4 — globally unique per message */
  id: string;
  /** Protocol version for future compatibility */
  version: number;
  /** MSG = normal message, ACK = delivery confirmation */
  type: MessageType;

  sender: {
    /** Base58 Ed25519 public key — this IS the sender's identity */
    id: string;
    /** Optional display alias chosen by the sender */
    alias?: string;
  };

  recipient: {
    /** Base58 Ed25519 public key of the intended recipient */
    id: string;
  };

  /** Encrypted message payload — only the recipient can decrypt this */
  payload: EncryptedPayload;

  routing: RoutingInfo;

  /** Base64 — Ed25519 signature over the entire message minus this field */
  signature: string;
}

/**
 * Decrypted content after the recipient opens the payload.
 * This is what gets displayed in the chat UI.
 */
export interface MessageContent {
  text?: string;
  /** ID of the message being acknowledged — used in ACK messages */
  ackedMessageId?: string;
}

/**
 * Local representation of a message stored in SQLite.
 * Combines MeshMessage fields with local state (status, isOutbound).
 */
export interface LocalMessage {
  id: string;
  senderId: string;
  recipientId: string;
  encryptedPayload: string; // JSON-stringified EncryptedPayload
  nonce: string;
  ephemeralPublicKey: string;
  signature: string;
  status: MessageStatus;
  ttl: number;
  hopCount: number;
  isOutbound: boolean; // true if we sent it, false if we received it
  createdAt: number;
  expiresAt: number;
  /** Decrypted text — populated after decryption, never stored */
  text?: string;
}
