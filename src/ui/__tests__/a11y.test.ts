import {describe, expect, it} from '@jest/globals';
import {deliveryExplanation, statusLabel} from '../a11y';
import {MESSAGE_TTL_MS} from '../../crypto/messageBuilder';

describe('statusLabel', () => {
  it('maps every message status to a spoken label', () => {
    expect(statusLabel('pending')).toBe('Sending');
    expect(statusLabel('sent')).toBe('Sent');
    expect(statusLabel('delivered')).toBe('Delivered');
    expect(statusLabel('failed')).toBe('Not delivered');
  });
});

describe('deliveryExplanation', () => {
  const hours = Math.round(MESSAGE_TTL_MS / 3600000);
  const createdAt = new Date(2026, 0, 5, 14, 14).getTime(); // Mon
  const base = {isOutbound: true, createdAt};
  const now = createdAt + 1000;

  it('explains a waiting 1:1 message with the deadline', () => {
    const text = deliveryExplanation({...base, status: 'pending'}, {name: 'Bob', now});
    expect(text).toBe(
      `Waiting until Bob, or someone who can reach them, is nearby. Aetheris keeps trying for ${hours} hours (until Thu 14:14).`,
    );
  });

  it('derives the hours from MESSAGE_TTL_MS', () => {
    expect(hours).toBe(72);
    const text = deliveryExplanation({...base, status: 'sent'}, {name: 'Bob', now});
    expect(text).toContain(`${MESSAGE_TTL_MS / 3600000} hours`);
  });

  it('avoids a past date once the deadline has passed', () => {
    const text = deliveryExplanation({...base, status: 'pending'}, {name: 'Bob', now: createdAt + MESSAGE_TTL_MS + 1});
    expect(text).toContain('Aetheris is still trying.');
    expect(text).not.toContain('(until');
  });

  it('names group members still waiting and caps the list', () => {
    const g = {...base, status: 'sent' as const, deliveredCount: 1, recipientCount: 3};
    const two = deliveryExplanation(g, {name: 'G', now, isGroup: true, waitingNames: ['Ana', 'Bob']});
    expect(two).toContain('Delivered to 1 of 3. Still waiting for Ana and Bob. Aetheris keeps trying');
    const many = deliveryExplanation(g, {name: 'G', now, isGroup: true, waitingNames: ['A', 'B', 'C', 'D', 'E']});
    expect(many).toContain('Still waiting for A, B, C and 2 more.');
  });

  it('explains failures', () => {
    expect(deliveryExplanation({...base, status: 'failed'}, {name: 'Bob', now})).toBe(
      `Nobody reached Bob within ${hours} hours.`,
    );
    expect(
      deliveryExplanation({...base, status: 'failed'}, {name: 'G', now, isGroup: true, waitingNames: ['Ana', 'Bob']}),
    ).toBe(`Nobody reached Ana and Bob within ${hours} hours.`);
  });

  it('returns null for delivered and inbound messages', () => {
    expect(deliveryExplanation({...base, status: 'delivered'}, {name: 'Bob', now})).toBeNull();
    expect(deliveryExplanation({...base, isOutbound: false, status: 'pending'}, {name: 'Bob', now})).toBeNull();
  });
});
