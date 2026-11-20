import {describe, expect, it} from '@jest/globals';
import {groupReactions, nextReaction} from '../reactions';

describe('groupReactions', () => {
  it('returns nothing for no reactions', () => {
    expect(groupReactions([], 'me')).toEqual([]);
  });
  it('groups by emoji in REACTIONS order and flags mine', () => {
    const list = [
      {emoji: '❤️', reactorId: 'a'},
      {emoji: '👍', reactorId: 'me'},
      {emoji: '👍', reactorId: 'a'},
    ];
    expect(groupReactions(list, 'me')).toEqual([
      {emoji: '👍', count: 2, mine: true},
      {emoji: '❤️', count: 1, mine: false},
    ]);
  });
  it('skips unknown emoji', () => {
    expect(groupReactions([{emoji: '💩', reactorId: 'a'}], 'me')).toEqual([]);
  });
});

describe('nextReaction', () => {
  it('adds when none or different', () => {
    expect(nextReaction(undefined, '👍')).toBe('👍');
    expect(nextReaction('❤️', '👍')).toBe('👍');
  });
  it('removes when same', () => {
    expect(nextReaction('👍', '👍')).toBe('');
  });
});
