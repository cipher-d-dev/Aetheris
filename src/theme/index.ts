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
  bg: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F2F5',
  border: '#E4E7EC',
  accent: '#5B7FFF',
  accentSoft: '#EEF1FF',
  accentBorder: '#C7D2FE',
  text: '#1A1D23',
  textSub: '#6B7280',
  textMuted: '#9CA3AF',
  overlay: 'rgba(0,0,0,0.4)',
  modalBg: '#FFFFFF',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E4E7EC',
  errorBg: '#FFF5F5',
  errorBorder: '#FED7D7',
  errorText: '#C53030',
  errorSub: '#FC8181',
  successBg: '#F0FFF4',
  successBorder: '#C6F6D5',
  successText: '#276749',
};

export const darkTheme = {
  bg: '#111318',
  surface: '#1C1F26',
  surfaceAlt: '#161920',
  border: '#262A34',
  accent: '#7C9EFF',
  accentSoft: '#1A1F35',
  accentBorder: '#2D3760',
  text: '#F1F3F7',
  textSub: '#8B92A5',
  textMuted: '#4B5263',
  overlay: 'rgba(0,0,0,0.65)',
  modalBg: '#1C1F26',
  tabBar: '#1C1F26',
  tabBarBorder: '#262A34',
  errorBg: '#1A0F0F',
  errorBorder: '#4A1A1A',
  errorText: '#FC8181',
  errorSub: '#C53030',
  successBg: '#0F1A14',
  successBorder: '#1A4A2A',
  successText: '#68D391',
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
