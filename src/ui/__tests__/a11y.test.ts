import {describe, expect, it} from '@jest/globals';
import {statusLabel} from '../a11y';

describe('statusLabel', () => {
  it('maps every message status to a spoken label', () => {
    expect(statusLabel('pending')).toBe('Sending');
    expect(statusLabel('sent')).toBe('Sent');
    expect(statusLabel('delivered')).toBe('Delivered');
    expect(statusLabel('failed')).toBe('Not delivered');
  });
});
