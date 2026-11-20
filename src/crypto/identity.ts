import sodium from 'react-native-sodium';
import * as Keychain from 'react-native-keychain';
import {toBase58, formatShortId} from './encoding';
import {Buffer} from 'buffer';

/**
 * Where the identity key pair lives. Stored without a fingerprint/face requirement:
 * the app needs the key at every launch and for every message, and an
 * auth-bound key hangs startup on phones with biometrics enrolled.
 */
export const KEYCHAIN_SERVICE = 'com.aetheris.identity.v2';
/** Old location, written with AES_GCM (biometric-bound on phones that have it). */
export const LEGACY_KEYCHAIN_SERVICE = 'com.aetheris.identity';
/** How long to wait on the old entry before giving up on it (it may be waiting for a prompt). */
export const LEGACY_READ_TIMEOUT_MS = 6000;

const STORE_OPTIONS = {
  service: KEYCHAIN_SERVICE,
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
};

export interface NodeIdentity {
  publicKeyBase58: string; // Full public key — this IS the user ID
  shortId: string; // XXXX-XXXX display format
}

interface StoredIdentity {
  publicKeyBase58: string;
  privateKeyBase64: string;
}

let cachedPrivateKey: string | null = null;

function parse(password: string): StoredIdentity | null {
  try {
    const s = JSON.parse(password);
    return s?.publicKeyBase58 && s?.privateKeyBase64 ? s : null;
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      v => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

async function save(id: StoredIdentity): Promise<void> {
  await Keychain.setGenericPassword(id.publicKeyBase58, JSON.stringify(id), STORE_OPTIONS);
}

/** Old installs: copy the key to the new location so it's never prompted for again. */
async function migrateLegacy(): Promise<StoredIdentity | null> {
  const legacy = await withTimeout(
    Keychain.getGenericPassword({service: LEGACY_KEYCHAIN_SERVICE}),
    LEGACY_READ_TIMEOUT_MS,
  );
  const stored = legacy ? parse(legacy.password) : null;
  if (!stored) return null;
  await save(stored);
  Keychain.resetGenericPassword({service: LEGACY_KEYCHAIN_SERVICE}).catch(() => undefined);
  return stored;
}

// Call once on app start
export async function initIdentity(): Promise<NodeIdentity> {
  const existing = await Keychain.getGenericPassword({service: KEYCHAIN_SERVICE}).catch(() => false as const);
  let stored = existing ? parse(existing.password) : null;
  if (!stored) stored = await migrateLegacy();

  if (!stored) {
    // First launch: generate a new Ed25519 key pair.
    const keypair = await sodium.crypto_sign_keypair();
    stored = {
      publicKeyBase58: toBase58(Buffer.from(keypair.pk, 'base64')),
      privateKeyBase64: keypair.sk, // already base64 from sodium
    };
    await save(stored);
  }

  cachedPrivateKey = stored.privateKeyBase64;
  return {publicKeyBase58: stored.publicKeyBase58, shortId: formatShortId(stored.publicKeyBase58)};
}

// Load private key when needed for signing/encryption
export async function loadPrivateKey(): Promise<string> {
  if (cachedPrivateKey) return cachedPrivateKey;
  const stored = await Keychain.getGenericPassword({service: KEYCHAIN_SERVICE});
  const parsed = stored ? parse(stored.password) : null;
  if (!parsed) throw new Error('Identity not initialized');
  cachedPrivateKey = parsed.privateKeyBase64;
  return cachedPrivateKey;
}

/** Tests only. */
export function _resetIdentityCacheForTests(): void {
  cachedPrivateKey = null;
}
