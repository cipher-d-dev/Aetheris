import { Buffer } from 'buffer';

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function toBase58(bytes: Uint8Array): string {
  let num = BigInt('0x' + Buffer.from(bytes).toString('hex'));
  let result = '';

  const base = BigInt(58);
  while (num > 0n) {
    result = BASE58_ALPHABET[Number(num % base)] + result;
    num = num / base;
  }

  // Leading zeros
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = '1' + result;
  }

  return result;
}

export function formatShortId(base58Id: string): string {
  // Take first 8 chars, format as XXXX-XXXX
  const trimmed = base58Id.slice(0, 8).toUpperCase();
  return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 8)}`;
}

/**
 * Convert Base58 encoded public key to Base64 for crypto operations.
 * This is the reverse of toBase58.
 */
export function base58ToBase64(base58: string): string {
  let num = BigInt(0);
  const base = BigInt(58);

  for (const char of base58) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) throw new Error(`Invalid Base58 char: ${char}`);
    num = num * base + BigInt(digit);
  }

  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num % 256n));
    num = num / 256n;
  }

  // Re-add leading zeros
  for (const char of base58) {
    if (char !== '1') break;
    bytes.unshift(0);
  }

  return Buffer.from(bytes).toString('base64');
}
