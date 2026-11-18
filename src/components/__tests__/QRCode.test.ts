import {describe, expect, it} from '@jest/globals';
import jsQR from 'jsqr';
import {Buffer} from 'buffer';
import {qrMatrix} from '../QRCode';
import {buildContactLink} from '../../contacts/contactLink';
import {toBase58} from '../../crypto/encoding';

function decode(matrix: boolean[][]): string | null {
  const scale = 4;
  const quiet = 4;
  const n = matrix.length + quiet * 2;
  const px = n * scale;
  const data = new Uint8ClampedArray(px * px * 4).fill(255);
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (!dark) return;
      for (let y = 0; y < scale; y++)
        for (let x = 0; x < scale; x++) {
          const i = (((r + quiet) * scale + y) * px + (c + quiet) * scale + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }),
  );
  return jsQR(data, px, px)?.data ?? null;
}

describe('QR code', () => {
  it('encodes a contact link that a standard scanner reads back', () => {
    const link = buildContactLink(toBase58(Buffer.alloc(32, 200)), 'Ada');
    expect(decode(qrMatrix(link))).toBe(link);
  });
});
