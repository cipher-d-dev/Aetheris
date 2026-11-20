import {beforeEach, expect, jest, test} from '@jest/globals';
const mockStore = new Map<string, {username: string; password: string; storage?: string}>();
const mockHanging = new Set<string>();

jest.mock('react-native-sodium', () => require('../../mesh/testing/sodiumShim').default);
jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: {WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly'},
  STORAGE_TYPE: {AES_GCM_NO_AUTH: 'KeystoreAESGCM_NoAuth', AES_GCM: 'KeystoreAESGCM'},
  getGenericPassword: jest.fn(async ({service}: {service: string}) => {
    if (mockHanging.has(service)) return new Promise(() => undefined); // waiting on a biometric prompt
    return mockStore.get(service) ?? false;
  }),
  setGenericPassword: jest.fn(async (username: string, password: string, opts: {service: string; storage?: string}) => {
    mockStore.set(opts.service, {username, password, storage: opts.storage});
    return {service: opts.service, storage: opts.storage};
  }),
  resetGenericPassword: jest.fn(async ({service}: {service: string}) => mockStore.delete(service)),
}));

import * as Keychain from 'react-native-keychain';
import {
  KEYCHAIN_SERVICE,
  LEGACY_KEYCHAIN_SERVICE,
  LEGACY_READ_TIMEOUT_MS,
  _resetIdentityCacheForTests,
  initIdentity,
  loadPrivateKey,
} from '../identity';

beforeEach(() => {
  mockStore.clear();
  mockHanging.clear();
  _resetIdentityCacheForTests();
  jest.clearAllMocks();
});

test('first launch creates a key stored without a biometric requirement', async () => {
  const id = await initIdentity();
  const saved = mockStore.get(KEYCHAIN_SERVICE)!;
  expect(saved.storage).toBe('KeystoreAESGCM_NoAuth');
  expect(JSON.parse(saved.password).publicKeyBase58).toBe(id.publicKeyBase58);
  expect(await loadPrivateKey()).toBe(JSON.parse(saved.password).privateKeyBase64);
});

test('second launch returns the same identity', async () => {
  const a = await initIdentity();
  _resetIdentityCacheForTests();
  const b = await initIdentity();
  expect(b.publicKeyBase58).toBe(a.publicKeyBase58);
});

test('an old install keeps its identity and is moved to no-auth storage', async () => {
  const old = {publicKeyBase58: 'OldPublicKey', privateKeyBase64: 'b2xk'};
  mockStore.set(LEGACY_KEYCHAIN_SERVICE, {username: old.publicKeyBase58, password: JSON.stringify(old), storage: 'KeystoreAESGCM'});
  const id = await initIdentity();
  expect(id.publicKeyBase58).toBe('OldPublicKey');
  expect(mockStore.get(KEYCHAIN_SERVICE)!.storage).toBe('KeystoreAESGCM_NoAuth');
  expect(mockStore.has(LEGACY_KEYCHAIN_SERVICE)).toBe(false);
  expect(await loadPrivateKey()).toBe('b2xk');
});

test('an old entry stuck waiting for a fingerprint does not block startup', async () => {
  jest.useFakeTimers();
  try {
    mockStore.set(LEGACY_KEYCHAIN_SERVICE, {username: 'x', password: '{}'});
    mockHanging.add(LEGACY_KEYCHAIN_SERVICE);
    const pending = initIdentity();
    await jest.advanceTimersByTimeAsync(LEGACY_READ_TIMEOUT_MS + 10);
    jest.useRealTimers();
    const id = await pending;
    expect(id.publicKeyBase58.length).toBeGreaterThan(30);
    expect(mockStore.get(KEYCHAIN_SERVICE)!.storage).toBe('KeystoreAESGCM_NoAuth');
  } finally {
    jest.useRealTimers();
  }
});

test('signing never goes back to the keychain after startup', async () => {
  await initIdentity();
  (Keychain.getGenericPassword as unknown as ReturnType<typeof jest.fn>).mockClear();
  await loadPrivateKey();
  await loadPrivateKey();
  expect(Keychain.getGenericPassword).not.toHaveBeenCalled();
});
