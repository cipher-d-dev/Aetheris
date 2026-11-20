import {describe, expect, it} from '@jest/globals';
import {ACCENTS, AccentName, buildTheme} from '..';

function luminance(hex: string): number {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const l = c.map(x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5; // WCAG AA, normal text
const UI = 3; // icons and other non-text UI

describe('every colour theme is readable in light and dark', () => {
  for (const accent of Object.keys(ACCENTS) as AccentName[]) {
    for (const dark of [false, true]) {
      const t = buildTheme(dark, accent);
      const checks: [string, string, string, number][] = [
        ['button text on primary', t.onPrimary, t.primary, TEXT],
        ['accent text on background', t.primaryText, t.bg, TEXT],
        ['selected chip text', t.chipOnText, t.chipOn, TEXT],
        ['your message text', t.bubbleOutText, t.bubbleOut, TEXT],
        ['your message time', t.bubbleOutMeta, t.bubbleOut, TEXT],
        ['reply name in your bubble', t.quoteName, t.bubbleOut, TEXT],
        ['reply name in their bubble', t.quoteName, t.bubbleIn, TEXT],
        ['read tick on your bubble', t.tickRead, t.bubbleOut, UI],
        ['active tab icon', t.primaryText, t.tabPill, UI],
        ['primary button against background', t.primary, t.bg, UI],
        ['their message time', t.bubbleInMeta, t.bubbleIn, TEXT],
        ['muted text', t.textMuted, t.bg, TEXT],
      ];
      for (const [what, fg, bg, min] of checks) {
        it(`${ACCENTS[accent].label} ${dark ? 'dark' : 'light'}: ${what}`, () => {
          expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
        });
      }
    }
  }
});
