/**
 * Signing module for Aetheris messages.
 *
 * Every message is signed by the sender using their Ed25519 private key.
 * Relay nodes verify the signature before forwarding.
 * This prevents:
 *   - Message tampering in transit
 *   - Spoofing (pretending to be someone else)
 *   - Replay attacks (combined with the expiresAt field)
 *
 * Signature covers: the entire MeshMessage object MINUS the signature field.
 * The canonical form is a deterministic JSON string with sorted keys.
 */

import sodium from 'react-native-sodium';
import {Buffer} from 'buffer';
import {MeshMessage} from '../types/message';
import {base58ToBase64} from './encoding';

/**
 * Produce a canonical string representation of a message for signing.
 * Keys are sorted alphabetically at every level to ensure determinism.
 */
function canonicalise(obj: unknown): string {
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalise).join(',') + ']';
  }
  if (obj !== null && typeof obj === 'object') {
    const sorted = Object.keys(obj as Record<string, unknown>)
      .sort()
      .map(
        k =>
          JSON.stringify(k) +
          ':' +
          canonicalise((obj as Record<string, unknown>)[k]),
      );
    return '{' + sorted.join(',') + '}';
  }
  return JSON.stringify(obj);
}

/**
 * Sign a MeshMessage with the sender's Ed25519 private key.
 *
 * @param message         The complete message object (signature field will be ignored)
 * @param privateKeyBase64 Sender's Ed25519 private key in Base64
 * @returns               Base64-encoded Ed25519 signature
 */
export async function signMessage(
  message: Omit<MeshMessage, 'signature'>,
  privateKeyBase64: string,
): Promise<string> {
  const {routing, ...signableFields} = message;
  const signableRouting = {
    originTimestamp: routing.originTimestamp,
    expiresAt: routing.expiresAt,
  };
  const signableMessage = {
    ...signableFields,
    routing: signableRouting,
  };
  const canonical = canonicalise(signableMessage);
  const messageBytes = Buffer.from(canonical, 'utf8').toString('base64');

  const signature = await sodium.crypto_sign_detached(
    messageBytes, // message as base64
    privateKeyBase64, // private key as base64
  );

  return signature; // base64 signature
}

/**
 * Verify a MeshMessage's signature against the claimed sender's public key.
 *
 * @param message The full MeshMessage including the signature field
 * @returns       true if valid, false if tampered or forged
 */
export async function verifySignature(message: MeshMessage): Promise<boolean> {
  try {
    const {signature, ...rest} = message;
    const {routing, ...signableFields} = rest;
    const signableRouting = {
      originTimestamp: routing.originTimestamp,
      expiresAt: routing.expiresAt,
    };
    const signableMessage = {
      ...signableFields,
      routing: signableRouting,
    };
    const canonical = canonicalise(signableMessage);
    const messageBytes = Buffer.from(canonical, 'utf8').toString('base64');

    // The sender's public key IS their node ID encoded in Base58.
    // We stored it as Base58 in the message — sodium needs Base64.
    // The identity module already stores the public key in Base64 form
    // inside the keychain, but here we receive it as the sender.id (Base58).
    // We convert: Base58 → raw bytes → Base64.
    const senderPublicKeyBase64 = base58ToBase64(message.sender.id);

    const valid = await sodium.crypto_sign_verify_detached(
      signature, // base64 signature
      messageBytes, // base64 message
      senderPublicKeyBase64, // base64 public key
    );

    return valid;
  } catch (e) {
    return false;
  }
}
