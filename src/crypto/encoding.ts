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
