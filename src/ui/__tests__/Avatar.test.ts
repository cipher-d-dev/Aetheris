import {describe, expect, it} from '@jest/globals';
import {COLORS, SENDER_TEXT_COLORS, senderTextColor} from '../Avatar';
import {darkTheme, lightTheme} from '../../theme';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('sender text colours', () => {
  it('has one pair per avatar colour', () => {
    expect(SENDER_TEXT_COLORS.length).toBe(COLORS.length);
  });

  it('meets WCAG AA on the incoming bubble in both themes', () => {
    for (const c of SENDER_TEXT_COLORS) {
      expect(contrast(c.light, lightTheme.bubbleIn)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.dark, darkTheme.bubbleIn)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('returns the matching entry for an id', () => {
    const light = senderTextColor('peer-1', false);
    const dark = senderTextColor('peer-1', true);
    const i = SENDER_TEXT_COLORS.findIndex(c => c.light === light);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(SENDER_TEXT_COLORS[i].dark).toBe(dark);
  });
});
