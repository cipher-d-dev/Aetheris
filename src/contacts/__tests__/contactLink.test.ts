import {describe, expect, it} from '@jest/globals';
import {Buffer} from 'buffer';
import {toBase58} from '../../crypto/encoding';
import {buildContactLink, parseContactLink} from '../contactLink';

const id = toBase58(Buffer.alloc(32, 7));

describe('contact links', () => {
  it('round-trips an ID and a name with spaces and emoji', () => {
    const link = buildContactLink(id, 'Ada L 🚀');
    expect(link.startsWith('aetheris://add/')).toBe(true);
    expect(parseContactLink(link)).toEqual({id, name: 'Ada L 🚀'});
  });

  it('accepts a bare ID', () => {
    expect(parseContactLink(`  ${id} `)).toEqual({id});
  });

  it('rejects junk and wrong-length keys', () => {
    expect(parseContactLink('https://example.com')).toBeNull();
    expect(parseContactLink('aetheris://add/abc')).toBeNull();
    expect(parseContactLink(toBase58(Buffer.alloc(16, 7)))).toBeNull();
    expect(parseContactLink('')).toBeNull();
  });
});
