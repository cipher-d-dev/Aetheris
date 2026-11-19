import {describe, expect, it} from '@jest/globals';
import {buildItems} from '../chatItems';
import type {ChatMessage} from '../../store/messagesStore';

const msg = (id: string, createdAt: number): ChatMessage => ({
  id,
  conversationId: 'c',
  senderId: 'a',
  recipientId: 'b',
  kind: 'text',
  text: id,
  status: 'delivered',
  isOutbound: false,
  createdAt,
});

const T = new Date(2026, 5, 10, 12).getTime();
const keys = (items: ReturnType<typeof buildItems>) => items.map(i => i.key);

describe('buildItems', () => {
  const list = [msg('m1', T), msg('m2', T + 1000), msg('m3', T + 2000)];

  it('has no divider without an anchor', () => {
    expect(keys(buildItems(list, false))).toEqual(['day-m1', 'm1', 'm2', 'm3']);
  });

  it('puts the divider right before the anchor message', () => {
    expect(keys(buildItems(list, false, 'm2'))).toEqual(['day-m1', 'm1', 'unread', 'm2', 'm3']);
  });

  it('puts the divider after the day separator when the anchor starts a day', () => {
    expect(keys(buildItems(list, false, 'm1'))).toEqual(['day-m1', 'unread', 'm1', 'm2', 'm3']);
  });

  it('skips the divider when the anchor is not in the loaded list', () => {
    expect(keys(buildItems(list, false, 'gone'))).toEqual(['day-m1', 'm1', 'm2', 'm3']);
  });
});
