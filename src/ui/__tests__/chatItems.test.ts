import {describe, expect, it} from '@jest/globals';
import {buildItems, findArrivalsAbove} from '../chatItems';
import type {ChatMessage} from '../../store/messagesStore';

const msg = (id: string, createdAt: number): ChatMessage => ({
  id,
  refId: id,
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

describe('findArrivalsAbove', () => {
  const out = (id: string, createdAt: number): ChatMessage => ({...msg(id, createdAt), isOutbound: true});

  it('does not count an appended inbound message', () => {
    const list = [msg('m1', T), msg('m2', T + 1000), msg('m3', T + 2000)];
    expect(findArrivalsAbove(new Set(['m1', 'm2']), list)).toEqual([]);
  });

  const HOUR = 3600 * 1000;
  const late = (id: string, createdAt: number): ChatMessage => ({...msg(id, createdAt), receivedAt: createdAt + 3 * HOUR});

  it('counts a late inbound message inserted above the last one, in order', () => {
    const list = [msg('m1', T), late('late1', T + 500), msg('m2', T + 1000), late('late2', T + 1500), msg('m3', T + 2000)];
    expect(findArrivalsAbove(new Set(['m1', 'm2', 'm3']), list)).toEqual(['late1', 'late2']);
  });

  it('ignores an on-time reply that lands just above our latest message', () => {
    const list = [msg('m1', T), {...msg('reply', T + 900), receivedAt: T + 1100}, msg('mine', T + 1000)];
    expect(findArrivalsAbove(new Set(['m1', 'mine']), list)).toEqual([]);
  });

  it('ignores outbound messages', () => {
    const list = [msg('m1', T), out('o1', T + 500), msg('m2', T + 1000)];
    expect(findArrivalsAbove(new Set(['m1', 'm2']), list)).toEqual([]);
  });

  it('ignores messages already seen', () => {
    const list = [msg('m1', T), msg('m2', T + 1000)];
    expect(findArrivalsAbove(new Set(['m1', 'm2']), list)).toEqual([]);
  });
});
