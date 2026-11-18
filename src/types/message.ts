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

export type MessageType = 'MSG' | 'ACK' | 'HANDSHAKE_CHALLENGE' | 'HANDSHAKE_RESPONSE';

export interface EncryptedPayload {
  /** Base64 — XSalsa20-Poly1305 ciphertext (libsodium crypto_box) */
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
  /**
   * Spray-and-Wait copy budget. Used only when no route to the recipient is
   * known: a node holding N > 1 copies hands half to a new neighbour and
   * keeps the rest. With 1 copy it waits until it meets the recipient or
   * learns a route. Not signed (relays change it).
   */
  copies?: number;
  /** Retransmission attempt (0 = first). Not signed. Part of the dedup key. */
  attempt?: number;
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
export type ContentKind = 'text' | 'image' | 'audio';

export interface MediaAttachment {
  /** e.g. image/jpeg, audio/mp4 */
  mime: string;
  /** Base64 file bytes */
  data: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface GroupInfo {
  id: string;
  name: string;
  /** Node IDs of every member, including the creator */
  members: string[];
}

export interface MessageContent {
  kind?: ContentKind;
  text?: string;
  media?: MediaAttachment;
  /** Sender's display name, carried inside the encrypted payload */
  alias?: string;
  /** Present when this message belongs to a group chat */
  group?: GroupInfo;
  /** ID shared by every per-member copy of one group message */
  groupMessageId?: string;
  /** ID of the message being acknowledged — used in ACK messages */
  ackedMessageId?: string;
  /** In ACKs: the relay nodes the acknowledged message passed through */
  path?: string[];
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
  serializedMessage?: string;
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
