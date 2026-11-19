import {describe, expect, it, jest} from '@jest/globals';
import {chatIdFromUrl, isKnownConversation} from '../deepLink';

describe('chatIdFromUrl', () => {
  it('parses a peer id', () => {
    expect(chatIdFromUrl('aetheris://chat/abc123')).toBe('abc123');
  });
  it('decodes encoded group ids', () => {
    expect(chatIdFromUrl('aetheris://chat/group%3Ag1')).toBe('group:g1');
  });
  it('rejects wrong scheme or host', () => {
    expect(chatIdFromUrl('https://chat/abc')).toBeNull();
    expect(chatIdFromUrl('aetheris://other/abc')).toBeNull();
  });
  it('rejects empty or malformed input', () => {
    expect(chatIdFromUrl('')).toBeNull();
    expect(chatIdFromUrl('aetheris://chat/')).toBeNull();
    expect(chatIdFromUrl('aetheris://chat/%E0%A4%A')).toBeNull();
  });
});

describe('isKnownConversation', () => {
  const group = jest.fn((id: string) => (id === 'g1' ? {} : null));
  const peer = jest.fn((id: string) => (id === 'p1' ? {} : null));
  it('checks groups and peers', () => {
    expect(isKnownConversation('group:g1', {group, peer})).toBe(true);
    expect(isKnownConversation('group:nope', {group, peer})).toBe(false);
    expect(isKnownConversation('p1', {group, peer})).toBe(true);
    expect(isKnownConversation('nope', {group, peer})).toBe(false);
  });
});
