/**
 * react-native-sodium's API (base64 strings in/out) implemented on top of
 * libsodium-wrappers, so tests exercise the real cryptography.
 */
import _sodium from 'libsodium-wrappers';

const ready = _sodium.ready.then(() => _sodium);
const V = () => _sodium.base64_variants.ORIGINAL;
const enc = (b: Uint8Array) => _sodium.to_base64(b, V());
const dec = (s: string) => _sodium.from_base64(s, V());

export default {
  crypto_box_NONCEBYTES: 24,
  randombytes_buf: async (n: number) => {
    const s = await ready;
    return enc(s.randombytes_buf(n));
  },
  crypto_sign_keypair: async () => {
    const s = await ready;
    const kp = s.crypto_sign_keypair();
    return {pk: enc(kp.publicKey), sk: enc(kp.privateKey)};
  },
  crypto_sign_detached: async (msg: string, sk: string) => {
    const s = await ready;
    return enc(s.crypto_sign_detached(dec(msg), dec(sk)));
  },
  crypto_sign_verify_detached: async (sig: string, msg: string, pk: string) => {
    const s = await ready;
    return s.crypto_sign_verify_detached(dec(sig), dec(msg), dec(pk));
  },
  crypto_sign_ed25519_pk_to_curve25519: async (pk: string) => {
    const s = await ready;
    return enc(s.crypto_sign_ed25519_pk_to_curve25519(dec(pk)));
  },
  crypto_sign_ed25519_sk_to_curve25519: async (sk: string) => {
    const s = await ready;
    return enc(s.crypto_sign_ed25519_sk_to_curve25519(dec(sk)));
  },
  crypto_box_keypair: async () => {
    const s = await ready;
    const kp = s.crypto_box_keypair();
    return {pk: enc(kp.publicKey), sk: enc(kp.privateKey)};
  },
  crypto_box_easy: async (m: string, n: string, pk: string, sk: string) => {
    const s = await ready;
    return enc(s.crypto_box_easy(dec(m), dec(n), dec(pk), dec(sk)));
  },
  crypto_box_open_easy: async (c: string, n: string, pk: string, sk: string) => {
    const s = await ready;
    return enc(s.crypto_box_open_easy(dec(c), dec(n), dec(pk), dec(sk)));
  },
};
