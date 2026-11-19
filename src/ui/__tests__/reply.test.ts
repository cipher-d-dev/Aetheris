import {describe, expect, it} from '@jest/globals';
import {replySnippet, resolveQuote} from '../reply';

describe('replySnippet', () => {
  it('returns short text trimmed', () => {
    expect(replySnippet({kind: 'text', text: '  hello  '})).toBe('hello');
  });
  it('cuts long text to 100 chars including the ellipsis', () => {
    const s = replySnippet({kind: 'text', text: 'a'.repeat(300)});
    expect(s).toHaveLength(100);
    expect(s.endsWith('…')).toBe(true);
    expect(replySnippet({kind: 'text', text: 'b'.repeat(100)})).toBe('b'.repeat(100));
  });
  it('labels media', () => {
    expect(replySnippet({kind: 'image', text: 'caption'})).toBe('Photo');
    expect(replySnippet({kind: 'audio', text: ''})).toBe('Voice message');
  });
});

describe('resolveQuote', () => {
  const nameOf = (id: string, alias?: string) => alias ?? `name-${id}`;
  const orig = {
    id: 'local-1',
    refId: 'ref-1',
    senderId: 'bob',
    senderAlias: 'Bob',
    isOutbound: false,
    kind: 'text' as const,
    text: 'the real text',
  };
  const claim = {id: 'ref-1', senderId: 'mallory', snippet: 'forged'};

  it('prefers the real original over forged claims', () => {
    expect(resolveQuote(claim, [orig], 'me', nameOf)).toEqual({
      name: 'Bob',
      snippet: 'the real text',
      targetId: 'local-1',
    });
  });
  it('falls back to the claimed values when the original is absent', () => {
    expect(resolveQuote(claim, [], 'me', nameOf)).toEqual({
      name: 'name-mallory',
      snippet: 'forged',
      targetId: null,
    });
  });
  it('shows You for your own message', () => {
    const mine = {...orig, senderId: 'me', isOutbound: true};
    expect(resolveQuote(claim, [mine], 'me', nameOf).name).toBe('You');
    expect(resolveQuote({...claim, senderId: 'me'}, [], 'me', nameOf).name).toBe('You');
  });
});
