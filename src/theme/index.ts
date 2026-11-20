import {create} from 'zustand';
import {Appearance} from 'react-native';

// ─── Typography ───────────────────────────────────────────────────────────────
// Figtree (SIL Open Font License), in android/app/src/main/assets/fonts.
// On Android the family name is the file name without extension.

export const Font = {
  regular: 'Figtree-Regular',
  medium: 'Figtree-Medium',
  semiBold: 'Figtree-SemiBold',
  bold: 'Figtree-Bold',
  extraBold: 'Figtree-ExtraBold',
};

export const Type = {
  largeTitle: {fontFamily: Font.extraBold, fontSize: 26, letterSpacing: -0.6},
  title: {fontFamily: Font.bold, fontSize: 18, letterSpacing: -0.2},
  headline: {fontFamily: Font.semiBold, fontSize: 15, letterSpacing: -0.1},
  body: {fontFamily: Font.regular, fontSize: 15, lineHeight: 21},
  callout: {fontFamily: Font.medium, fontSize: 13.5},
  footnote: {fontFamily: Font.regular, fontSize: 12.5},
  caption: {fontFamily: Font.medium, fontSize: 11},
};

// ─── Palettes ─────────────────────────────────────────────────────────────────
// Aetheris's own palette on a familiar messenger layout: neutral surfaces, one
// iris-violet accent, violet-tinted bubbles for your messages and a quiet,
// original patterned wallpaper.

export const lightTheme = {
  isDark: false,
  bg: '#FFFFFF',
  surface: '#F1F1F6',
  surfaceAlt: '#E7E7EF',
  border: '#E3E3EC',
  separator: '#EEEEF3',

  primary: '#5A4FDB',
  primaryPressed: '#4C42C4',
  primarySoft: '#ECEAFD',
  /** Accent used for text/icons on bg (darker than primary for contrast) */
  primaryText: '#4D43CC',
  onPrimary: '#FFFFFF',

  text: '#14141F',
  textSub: '#565870',
  textMuted: '#6B6D84',

  chip: '#FFFFFF',
  chipBorder: '#DCDCE6',
  chipOn: '#ECEAFD',
  chipOnText: '#3F36B3',

  tabPill: '#ECEAFD',
  tickRead: '#5A4FDB',

  chatBg: '#EFEFF6',
  wallpaperTint: '#6A66A0',
  wallpaperOpacity: 0.08,
  chatHeader: '#FFFFFF',
  bubbleOut: '#E3E0FF',
  bubbleOutText: '#14141F',
  bubbleOutMeta: '#575573',
  bubbleIn: '#FFFFFF',
  bubbleInText: '#14141F',
  bubbleInMeta: '#696B80',
  quoteOut: 'rgba(90,79,219,0.10)',
  quoteIn: '#F1F1F6',
  quoteBar: '#5A4FDB',
  quoteName: '#4D43CC',
  bubbleShadow: true,

  online: '#1FB45A',
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
  warningSoft: '#FFF4DE',
  warningText: '#8A4B00',
  overlay: 'rgba(11,20,26,0.45)',
  shadow: '#0B141A',
};

export type AppTheme = typeof lightTheme;

export const darkTheme: AppTheme = {
  isDark: true,
  bg: '#0E0F15',
  surface: '#1A1B24',
  surfaceAlt: '#23242F',
  border: '#2A2B37',
  separator: '#191A22',

  primary: '#8C82FF',
  primaryPressed: '#7A70F0',
  primarySoft: '#262350',
  primaryText: '#A9A2FF',
  onPrimary: '#110D35',

  text: '#ECECF3',
  textSub: '#A2A3B5',
  textMuted: '#80829A',

  chip: 'transparent',
  chipBorder: '#2E2F3C',
  chipOn: '#262350',
  chipOnText: '#C6C1FF',

  tabPill: '#262350',
  tickRead: '#B9B3FF',

  chatBg: '#0B0C11',
  wallpaperTint: '#FFFFFF',
  wallpaperOpacity: 0.045,
  chatHeader: '#13141B',
  bubbleOut: '#36318A',
  bubbleOutText: '#F1F0FF',
  bubbleOutMeta: '#C4C0F0',
  bubbleIn: '#1E1F29',
  bubbleInText: '#ECECF3',
  bubbleInMeta: '#A2A3B5',
  quoteOut: 'rgba(0,0,0,0.22)',
  quoteIn: 'rgba(255,255,255,0.05)',
  quoteBar: '#A9A2FF',
  quoteName: '#B9B3FF',
  bubbleShadow: false,

  online: '#3DDC84',
  danger: '#FF6369',
  dangerSoft: '#2C1416',
  warningSoft: '#2B2111',
  warningText: '#FFB224',
  overlay: 'rgba(0,0,0,0.6)',
  shadow: '#000000',
};

// ─── Store ────────────────────────────────────────────────────────────────────

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  theme: AppTheme;
  setMode: (mode: ThemeMode) => void;
  /** Re-read the system setting (called when it changes). */
  syncSystem: () => void;
}

function resolve(mode: ThemeMode): boolean {
  return mode === 'dark' || (mode === 'system' && Appearance.getColorScheme() === 'dark');
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'system',
  isDark: resolve('system'),
  theme: resolve('system') ? darkTheme : lightTheme,
  setMode: mode => {
    const isDark = resolve(mode);
    set({mode, isDark, theme: isDark ? darkTheme : lightTheme});
  },
  syncSystem: () => get().setMode(get().mode),
}));
