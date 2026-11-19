import {describe, expect, it} from '@jest/globals';
import {LATE_ARRIVAL_MS, isLate, lateAccessibilityLabel, lateLabel} from '../late';

const at = (d: number, h: number, m: number) => new Date(2026, 0, d, h, m).getTime();

describe('isLate', () => {
  const sent = at(5, 14, 14);
  it('flags inbound messages that arrived more than 10 minutes after sending', () => {
    expect(isLate({isOutbound: false, createdAt: sent, receivedAt: sent + LATE_ARRIVAL_MS + 1})).toBe(true);
  });
  it('does not flag exactly 10 minutes, outbound, or rows without receivedAt', () => {
    expect(isLate({isOutbound: false, createdAt: sent, receivedAt: sent + LATE_ARRIVAL_MS})).toBe(false);
    expect(isLate({isOutbound: true, createdAt: sent, receivedAt: sent + 3 * LATE_ARRIVAL_MS})).toBe(false);
    expect(isLate({isOutbound: false, createdAt: sent})).toBe(false);
  });
});

describe('lateLabel', () => {
  const m = {createdAt: at(5, 14, 14), receivedAt: at(5, 16, 40)};
  it('shows both clock times', () => {
    expect(lateLabel(m)).toBe('Sent 14:14 · arrived 16:40');
  });
  it('always shows the arrival clock time, even right after arrival', () => {
    expect(lateLabel(m)).toBe('Sent 14:14 · arrived 16:40');
  });
  it('adds the weekday when sent on another day', () => {
    const n = {createdAt: at(6, 14, 14), receivedAt: at(7, 9, 2)}; // Tue -> Wed
    expect(lateLabel(n)).toBe('Sent Tue 14:14 · arrived 09:02');
  });
  it('uses a date when sent six or more days earlier', () => {
    const n = {createdAt: at(1, 14, 14), receivedAt: at(9, 9, 2)};
    expect(lateLabel(n)).toMatch(/^Sent .*14:14 · arrived 09:02$/);
    expect(lateLabel(n)).not.toContain('Thu 14:14');
  });
  it('has a spoken form', () => {
    expect(lateAccessibilityLabel(m)).toBe('Sent 14:14, arrived 16:40, delayed on the way');
  });
});
