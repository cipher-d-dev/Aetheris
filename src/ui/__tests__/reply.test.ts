import {describe, expect, it} from '@jest/globals';
import {replySnippet} from '../reply';

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
