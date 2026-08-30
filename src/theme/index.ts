import {create} from 'zustand';

// ─── Font Families ────────────────────────────────────────────────────────────
// Fonts live in android/app/src/main/assets/fonts/
// React Native matches by filename (without extension)

export const Font = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semiBold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
  extraBold: 'Inter-ExtraBold',
};

// ─── Palettes ─────────────────────────────────────────────────────────────────

export const lightTheme = {
  // Backgrounds
  bg: '#F4F5F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F5',
  border: '#E2E5ED',

  // Accent system — cool indigo-violet
  accent: '#6C5CE7',
  accentSoft: 'rgba(108, 92, 231, 0.08)',
  accentBorder: 'rgba(108, 92, 231, 0.2)',
  accentGlow: 'rgba(108, 92, 231, 0.25)',
  gradient: ['#6C5CE7', '#A17FE0'] as [string, string],

  // Text
  text: '#1A1D26',
  textSub: '#5A6175',
  textMuted: '#8E95A9',

  // Overlays
  overlay: 'rgba(0,0,0,0.35)',
  modalBg: '#FFFFFF',

  // Tab bar
  tabBar: '#FFFFFF',
  tabBarBorder: '#E2E5ED',

  // Status colors
  errorBg: '#FFF5F5',
  errorBorder: '#FED7D7',
  errorText: '#E53E3E',
  errorSub: '#FC8181',
  successBg: '#F0FFF4',
  successBorder: '#C6F6D5',
  successText: '#38A169',

  // Chat bubbles
  bubbleOut: '#6C5CE7',
  bubbleOutText: '#FFFFFF',
  bubbleIn: '#FFFFFF',
  bubbleInText: '#1A1D26',
  bubbleInBorder: '#E2E5ED',

  // Online indicator
  online: '#38D9A9',
};

export const darkTheme = {
  // Backgrounds — deep OLED-friendly navy
  bg: '#0B0E14',
  surface: '#141820',
  surfaceAlt: '#111520',
  border: '#1E2430',

  // Accent system — luminous cyan-to-violet
  accent: '#7B8CFF',
  accentSoft: 'rgba(123, 140, 255, 0.1)',
  accentBorder: 'rgba(123, 140, 255, 0.2)',
  accentGlow: 'rgba(123, 140, 255, 0.3)',
  gradient: ['#7B8CFF', '#A78BFA'] as [string, string],

  // Text — high contrast for OLED
  text: '#F0F2F8',
  textSub: '#8892AB',
  textMuted: '#4A5268',

  // Overlays
  overlay: 'rgba(0,0,0,0.7)',
  modalBg: '#141820',

  // Tab bar
  tabBar: '#0F1219',
  tabBarBorder: '#1A1F2B',

  // Status colors
  errorBg: 'rgba(239, 68, 68, 0.1)',
  errorBorder: 'rgba(239, 68, 68, 0.2)',
  errorText: '#FF6B6B',
  errorSub: '#C53030',
  successBg: 'rgba(52, 211, 153, 0.1)',
  successBorder: 'rgba(52, 211, 153, 0.2)',
  successText: '#34D399',

  // Chat bubbles — gradient accent for outbound
  bubbleOut: '#7B8CFF',
  bubbleOutText: '#FFFFFF',
  bubbleIn: '#181D28',
  bubbleInText: '#F0F2F8',
  bubbleInBorder: '#242A38',

  // Online indicator
  online: '#34D399',
};

export type AppTheme = typeof darkTheme;

// ─── Zustand Store ────────────────────────────────────────────────────────────

interface ThemeState {
  isDark: boolean;
  theme: AppTheme;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>(set => ({
  isDark: true,
  theme: darkTheme,
  toggle: () =>
    set(state => ({
      isDark: !state.isDark,
      theme: state.isDark ? lightTheme : darkTheme,
    })),
}));
