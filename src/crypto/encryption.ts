/**
 * Encryption module for Aetheris messages.
 *
 * Scheme:
 *   - Key exchange : X25519 (Curve25519 Diffie-Hellman)
 *   - Encryption   : XSalsa20-Poly1305 via libsodium crypto_box
 *   - Each message uses a fresh ephemeral keypair for forward secrecy.
 *
 * How it works:
 *   1. Sender generates a throwaway (ephemeral) X25519 keypair.
 *   2. Sender computes shared secret = X25519(ephemeralPrivate, recipientPublic).
 *   3. Sender encrypts plaintext with the shared secret + random nonce.
 *   4. Sender attaches ephemeralPublicKey to the message so the recipient
 *      can recompute the same shared secret.
 *   5. Recipient computes shared secret = X25519(recipientPrivate, ephemeralPublic).
 *   6. Recipient decrypts.
 *
 * Neither the sender's long-term private key nor the recipient's private key
 * ever leaves the device. The ephemeral key is discarded after use.
 */

import sodium from 'react-native-sodium';
import {Buffer} from 'buffer';
import {EncryptedPayload} from '../types/message';

/**
 * Encrypt a plaintext string for a specific recipient.
 *
 * @param plaintext          The message text to encrypt
 * @param recipientPublicKey The recipient's Base58 Ed25519 public key
 * @returns                  EncryptedPayload ready to embed in a MeshMessage
 */
export async function encryptForRecipient(
  plaintext: string,
  recipientPublicKeyBase64: string,
): Promise<EncryptedPayload> {
  // 1. Generate ephemeral keypair for this message only
  const ephemeral = await sodium.crypto_box_keypair();

  // 2. Generate random nonce (24 bytes for crypto_box)
  const nonce = await sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);

  // 3. Encrypt using crypto_box (X25519 + XSalsa20-Poly1305)
  //    crypto_box_easy encrypts + authenticates in one step.
  const plaintextBytes = Buffer.from(plaintext, 'utf8').toString('base64');

  const ciphertext = await sodium.crypto_box_easy(
    plaintextBytes, // message (base64)
    nonce, // nonce (base64)
    recipientPublicKeyBase64, // recipient public key (base64)
    ephemeral.sk, // ephemeral private key (base64)
  );

  return {
    encrypted: ciphertext,
    nonce: nonce,
    ephemeralPublicKey: ephemeral.pk,
  };
}

/**
 * Decrypt a payload addressed to us.
 *
 * @param payload            The EncryptedPayload from the MeshMessage
 * @param ourPrivateKeyBase64 Our Ed25519 private key in Base64
 * @returns                  Decrypted plaintext string
 */
export async function decryptFromSender(
  payload: EncryptedPayload,
  ourPrivateKeyBase64: string,
): Promise<string> {
  // Derive the X25519 private key from our Ed25519 private key.
  // libsodium stores Ed25519 keypairs as [private seed | public key],
  // and crypto_sign_ed25519_sk_to_curve25519 converts the signing key
  // to a Curve25519 key suitable for crypto_box.
  const ourCurvePrivate = await sodium.crypto_sign_ed25519_sk_to_curve25519(
    ourPrivateKeyBase64,
  );

  const plaintextBase64 = await sodium.crypto_box_open_easy(
    payload.encrypted, // ciphertext (base64)
    payload.nonce, // nonce (base64)
    payload.ephemeralPublicKey, // sender's ephemeral public key (base64)
    ourCurvePrivate, // our Curve25519 private key (base64)
  );

  return Buffer.from(plaintextBase64, 'base64').toString('utf8');
}
