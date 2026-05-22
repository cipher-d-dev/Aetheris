/**
 * messageBuilder.ts
 *
 * High-level helpers for constructing and parsing MeshMessages.
 * This is what the UI calls — it handles all the crypto internally.
 */

import 'react-native-get-random-values';
import {v4 as uuidv4} from 'uuid';
import {MeshMessage, MessageContent, MessageType} from '../types/message';
import {encryptForRecipient, decryptFromSender} from './encryption';
import {signMessage, verifySignature} from './signing';
import {loadPrivateKey} from './identity';
import {Buffer} from 'buffer';

const PROTOCOL_VERSION = 1;
const DEFAULT_TTL = 7;
const MESSAGE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

/**
 * Build, encrypt, and sign a new outbound message.
 *
 * @param senderIdBase58       Our node ID (Base58 public key)
 * @param senderAlias          Our optional display name
 * @param recipientIdBase58    Recipient's node ID (Base58 public key)
 * @param recipientPublicKeyBase64 Recipient's public key in Base64 for encryption
 * @param content              The message content to encrypt
 * @param type                 'MSG' for normal, 'ACK' for acknowledgement
 */
export async function buildMessage(
  senderIdBase58: string,
  senderAlias: string | undefined,
  recipientIdBase58: string,
  recipientPublicKeyBase64: string,
  content: MessageContent,
  type: MessageType = 'MSG',
): Promise<MeshMessage> {
  const now = Date.now();

  // 1. Serialize and encrypt the content
  const plaintext = JSON.stringify(content);
  const encryptedPayload = await encryptForRecipient(
    plaintext,
    recipientPublicKeyBase64,
  );

  // 2. Build the unsigned message
  const unsigned: Omit<MeshMessage, 'signature'> = {
    id: uuidv4(),
    version: PROTOCOL_VERSION,
    type,
    sender: {
      id: senderIdBase58,
      ...(senderAlias ? {alias: senderAlias} : {}),
    },
    recipient: {
      id: recipientIdBase58,
    },
    payload: encryptedPayload,
    routing: {
      ttl: DEFAULT_TTL,
      hops: [],
      originTimestamp: now,
      expiresAt: now + MESSAGE_TTL_MS,
    },
  };

  // 3. Sign it
  const privateKey = await loadPrivateKey();
  const signature = await signMessage(unsigned, privateKey);

  return {...unsigned, signature};
}

/**
 * Build an ACK message in response to a received message.
 */
export async function buildAck(
  senderIdBase58: string,
  recipientIdBase58: string,
  recipientPublicKeyBase64: string,
  originalMessageId: string,
): Promise<MeshMessage> {
  return buildMessage(
    senderIdBase58,
    undefined,
    recipientIdBase58,
    recipientPublicKeyBase64,
    {ackedMessageId: originalMessageId},
    'ACK',
  );
}

/**
 * Verify and decrypt an inbound message addressed to us.
 *
 * @param message          The received MeshMessage
 * @param ourPrivateKeyBase64 Our private key for decryption
 * @returns                Decrypted MessageContent, or null if verification fails
 */
export async function openMessage(
  message: MeshMessage,
  ourPrivateKeyBase64: string,
): Promise<MessageContent | null> {
  // 1. Verify signature — reject if tampered or forged
  const valid = await verifySignature(message);
  if (!valid) {
    console.warn(
      '[messageBuilder] Signature verification failed for',
      message.id,
    );
    return null;
  }

  // 2. Check expiry
  if (Date.now() > message.routing.expiresAt) {
    console.warn('[messageBuilder] Message expired:', message.id);
    return null;
  }

  // 3. Decrypt
  try {
    const plaintext = await decryptFromSender(
      message.payload,
      ourPrivateKeyBase64,
    );
    return JSON.parse(plaintext) as MessageContent;
  } catch (e) {
    console.warn('[messageBuilder] Decryption failed for', message.id, e);
    return null;
  }
}

/**
 * Serialize a MeshMessage to bytes for wire transmission.
 */
export function serializeMessage(message: MeshMessage): string {
  return JSON.stringify(message);
}

/**
 * Deserialize bytes received over Wi-Fi Direct back into a MeshMessage.
 * Returns null if the data is malformed.
 */
export function deserializeMessage(data: string): MeshMessage | null {
  try {
    return JSON.parse(data) as MeshMessage;
  } catch (e) {
    console.warn('[messageBuilder] Deserialization failed:', e);
    return null;
  }
}
