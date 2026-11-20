import {create} from 'zustand';
import {Appearance} from 'react-native';

// ─── Typography ───────────────────────────────────────────────────────────────
// Plus Jakarta Sans (SIL Open Font License), in android/app/src/main/assets/fonts.
// On Android the family name is the file name without extension.

export const Font = {
  regular: 'PlusJakartaSans-Regular',
  medium: 'PlusJakartaSans-Medium',
  semiBold: 'PlusJakartaSans-SemiBold',
  bold: 'PlusJakartaSans-Bold',
  extraBold: 'PlusJakartaSans-ExtraBold',
};

export const Type = {
  largeTitle: {fontFamily: Font.extraBold, fontSize: 30, letterSpacing: -0.8},
  title: {fontFamily: Font.bold, fontSize: 20, letterSpacing: -0.3},
  headline: {fontFamily: Font.semiBold, fontSize: 16, letterSpacing: -0.1},
  body: {fontFamily: Font.regular, fontSize: 15.5, lineHeight: 22},
  callout: {fontFamily: Font.medium, fontSize: 14},
  footnote: {fontFamily: Font.regular, fontSize: 13},
  caption: {fontFamily: Font.medium, fontSize: 11.5},
};

// ─── Palettes ─────────────────────────────────────────────────────────────────

export const lightTheme = {
  isDark: false,
  bg: '#FFFFFF',
  surface: '#F5F6F8',
  surfaceAlt: '#ECEEF2',
  border: '#E8EAEE',
  separator: '#EFF1F4',

  primary: '#5B5BD6',
  primaryPressed: '#4F4FC4',
  primarySoft: '#EEEEFC',
  onPrimary: '#FFFFFF',

  text: '#0F1419',
  textSub: '#5B6573',
  textMuted: '#8C96A3',

  chatBg: '#F2F3F7',
  bubbleOut: '#5B5BD6',
  bubbleOutText: '#FFFFFF',
  bubbleOutMeta: 'rgba(255,255,255,0.9)', // 4.7:1 on bubbleOut
  bubbleIn: '#FFFFFF',
  bubbleInText: '#0F1419',
  bubbleInMeta: '#6B7480', // 4.7:1 on bubbleIn

  online: '#22C55E',
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
  warningSoft: '#FFF6E5',
  warningText: '#A35200',
  overlay: 'rgba(15,20,25,0.45)',
  shadow: '#0F1419',
};

export type AppTheme = typeof lightTheme;

export const darkTheme: AppTheme = {
  isDark: true,
  bg: '#0E0F13',
  surface: '#17181E',
  surfaceAlt: '#202129',
  border: '#26272F',
  separator: '#1D1E25',

  primary: '#7C7CF0',
  primaryPressed: '#6C6CE0',
  primarySoft: '#23233F',
  onPrimary: '#FFFFFF',

  text: '#EEEFF2',
  textSub: '#A3A7B3',
  textMuted: '#6F7482',

  chatBg: '#0A0B0E',
  bubbleOut: '#5B5BD6',
  bubbleOutText: '#FFFFFF',
  bubbleOutMeta: 'rgba(255,255,255,0.9)', // 4.7:1 on bubbleOut
  bubbleIn: '#1C1D24',
  bubbleInText: '#EEEFF2',
  bubbleInMeta: '#8E94A3', // 5.5:1 on bubbleIn

  online: '#34D399',
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
