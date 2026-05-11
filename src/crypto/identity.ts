import sodium from 'react-native-sodium';
import * as Keychain from 'react-native-keychain';
import {toBase58, formatShortId} from './encoding';
import { Buffer } from 'buffer';

const KEYCHAIN_SERVICE = 'com.aetheris.identity';

export interface NodeIdentity {
  publicKeyBase58: string; // Full public key — this IS the user ID
  shortId: string; // XXXX-XXXX display format
}

// Call once on app start
export async function initIdentity(): Promise<NodeIdentity> {
  // 1. Try to load existing keypair from Keychain
  const existing = await Keychain.getGenericPassword({
    service: KEYCHAIN_SERVICE,
  });

  if (existing) {
    const stored = JSON.parse(existing.password);
    const publicKeyBase58 = stored.publicKeyBase58;
    return {
      publicKeyBase58,
      shortId: formatShortId(publicKeyBase58),
    };
  }

  // 2. First launch — generate new Ed25519 keypair
  const keypair = await sodium.crypto_sign_keypair();

  const publicKeyBase58 = toBase58(Buffer.from(keypair.pk, 'base64'));
  const privateKeyBase64 = keypair.sk; // Already base64 from sodium

  // 3. Store in Android Keystore via react-native-keychain
  await Keychain.setGenericPassword(
    publicKeyBase58, // username = public key (non-secret)
    JSON.stringify({
      publicKeyBase58,
      privateKeyBase64,
    }),
    {
      service: KEYCHAIN_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      storage: Keychain.STORAGE_TYPE.RSA, // Uses Android Keystore hardware
    },
  );

  return {
    publicKeyBase58,
    shortId: formatShortId(publicKeyBase58),
  };
}

// Load private key when needed for signing/encryption
export async function loadPrivateKey(): Promise<string> {
  const stored = await Keychain.getGenericPassword({service: KEYCHAIN_SERVICE});
  if (!stored) throw new Error('Identity not initialized');
  return JSON.parse(stored.password).privateKeyBase64;
}
