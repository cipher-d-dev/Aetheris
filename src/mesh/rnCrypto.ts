/**
 * MeshCrypto implementation backed by libsodium (react-native-sodium).
 *   - identity / signatures: Ed25519
 *   - message encryption:    X25519 + XSalsa20-Poly1305 (crypto_box) with a
 *                            fresh ephemeral key per message
 */
import sodium from 'react-native-sodium';
import {Buffer} from 'buffer';
import {MeshMessage, MessageContent} from '../types/message';
import {MeshCrypto} from './meshNode';
import {buildMessage} from '../crypto/messageBuilder';
import {verifySignature} from '../crypto/signing';
import {decryptFromSender} from '../crypto/encryption';
import {base58ToBase64} from '../crypto/encoding';

export function createRnCrypto(selfId: string, privateKeyBase64: string): MeshCrypto {
  const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

  return {
    randomNonce: () => sodium.randombytes_buf(32),

    signText: text => sodium.crypto_sign_detached(b64(text), privateKeyBase64),

    verifyText: async (text, signature, signerId) => {
      try {
        return await sodium.crypto_sign_verify_detached(
          signature,
          b64(text),
          base58ToBase64(signerId),
        );
      } catch {
        return false;
      }
    },

    buildMessage: ({id, recipientId, content, type, ttl}) =>
      buildMessage(
        selfId,
        undefined,
        recipientId,
        base58ToBase64(recipientId),
        content,
        type,
        id,
        privateKeyBase64,
        ttl,
      ),

    verifyMessage: (m: MeshMessage) => verifySignature(m),

    openMessage: async (m: MeshMessage): Promise<MessageContent | null> => {
      try {
        const plaintext = await decryptFromSender(m.payload, privateKeyBase64);
        return JSON.parse(plaintext) as MessageContent;
      } catch {
        return null;
      }
    },
  };
}
