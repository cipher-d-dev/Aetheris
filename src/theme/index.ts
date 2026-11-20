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
// Neutral surfaces shared by every colour theme; lightTheme/darkTheme hold the
// default Iris accents. Other accents are defined under "Colour themes".

export const lightTheme = {
  isDark: false,
  bg: '#FFFFFF',
  surface: '#F1F2F5',
  surfaceAlt: '#E7E9ED',
  border: '#E2E4EA',
  separator: '#EEEFF2',

  primary: '#5A4FDB',
  primaryPressed: '#4C42C4',
  primarySoft: '#ECEAFD',
  /** Accent used for text/icons on bg (darker than primary for contrast) */
  primaryText: '#4D43CC',
  onPrimary: '#FFFFFF',

  text: '#14141F',
  textSub: '#575A6B',
  textMuted: '#696C7E',

  chip: '#FFFFFF',
  chipBorder: '#DADDE3',
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
  quoteIn: '#F1F2F5',
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
  bg: '#0E0F14',
  surface: '#1A1B22',
  surfaceAlt: '#23252D',
  border: '#2A2C35',
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
  chipBorder: '#2E3039',
  chipOn: '#262350',
  chipOnText: '#C6C1FF',

  tabPill: '#262350',
  tickRead: '#B9B3FF',

  chatBg: '#0B0C11',
  wallpaperTint: '#FFFFFF',
  wallpaperOpacity: 0.045,
  chatHeader: '#131419',
  bubbleOut: '#36318A',
  bubbleOutText: '#F1F0FF',
  bubbleOutMeta: '#C4C0F0',
  bubbleIn: '#1E2027',
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

// ─── Colour themes ────────────────────────────────────────────────────────────
// Every theme shares the neutral surfaces above and swaps the accent tokens
// below, for light and dark. src/theme/__tests__/contrast.test.ts checks every
// theme in both modes for readable contrast.

const ACCENT_KEYS = [
  'primary', 'primaryPressed', 'primarySoft', 'primaryText', 'onPrimary',
  'chipOn', 'chipOnText', 'tabPill', 'tickRead',
  'chatBg', 'wallpaperTint',
  'bubbleOut', 'bubbleOutText', 'bubbleOutMeta', 'quoteOut', 'quoteBar', 'quoteName',
] as const;
type AccentTokens = Pick<AppTheme, (typeof ACCENT_KEYS)[number]>;

export type AccentName = 'iris' | 'ocean' | 'jade' | 'sunset' | 'rose' | 'graphite';

function pick(theme: AppTheme): AccentTokens {
  return Object.fromEntries(ACCENT_KEYS.map(k => [k, theme[k]])) as AccentTokens;
}

export const ACCENTS: Record<AccentName, {label: string; swatch: [string, string]; light: AccentTokens; dark: AccentTokens}> = {
  iris: {label: 'Iris', swatch: ['#8C7CFF', '#4C3FD1'], light: pick(lightTheme), dark: pick(darkTheme)},
  ocean: {
    label: 'Ocean',
    swatch: ['#5AA9FF', '#1A5FCC'],
    light: {
      primary: '#1A66CC', primaryPressed: '#1557AD', primarySoft: '#E1EEFD', primaryText: '#1A5FBF', onPrimary: '#FFFFFF',
      chipOn: '#E1EEFD', chipOnText: '#154C99', tabPill: '#E1EEFD', tickRead: '#1A66CC',
      chatBg: '#EDF2F8', wallpaperTint: '#5F7896',
      bubbleOut: '#DBEAFF', bubbleOutText: '#14141F', bubbleOutMeta: '#4A5D78', quoteOut: 'rgba(26,102,204,0.10)', quoteBar: '#1A66CC', quoteName: '#1A5FBF',
    },
    dark: {
      primary: '#4D9BFF', primaryPressed: '#3B87EB', primarySoft: '#13284A', primaryText: '#7CB6FF', onPrimary: '#04182F',
      chipOn: '#13284A', chipOnText: '#A9CFFF', tabPill: '#13284A', tickRead: '#9FD0FF',
      chatBg: '#0A0D12', wallpaperTint: '#FFFFFF',
      bubbleOut: '#164A87', bubbleOutText: '#F0F6FF', bubbleOutMeta: '#B5CDEB', quoteOut: 'rgba(0,0,0,0.22)', quoteBar: '#7CB6FF', quoteName: '#9FD0FF',
    },
  },
  jade: {
    label: 'Jade',
    swatch: ['#34D399', '#0A8463'],
    light: {
      primary: '#0A8463', primaryPressed: '#087356', primarySoft: '#D7F3E8', primaryText: '#08795A', onPrimary: '#FFFFFF',
      chipOn: '#D7F3E8', chipOnText: '#08694E', tabPill: '#D7F3E8', tickRead: '#08795A',
      chatBg: '#EDF0EB', wallpaperTint: '#5E7A6C',
      bubbleOut: '#D3F4E1', bubbleOutText: '#111B21', bubbleOutMeta: '#4C6A5B', quoteOut: 'rgba(8,105,78,0.10)', quoteBar: '#0A8463', quoteName: '#08795A',
    },
    dark: {
      primary: '#22C38E', primaryPressed: '#1DAA7C', primarySoft: '#16352C', primaryText: '#3DD6A3', onPrimary: '#04231A',
      chipOn: '#16352C', chipOnText: '#7BE5C0', tabPill: '#16352C', tickRead: '#7BE5C0',
      chatBg: '#0A0E0D', wallpaperTint: '#FFFFFF',
      bubbleOut: '#14523F', bubbleOutText: '#E9EDEF', bubbleOutMeta: '#A7C7BA', quoteOut: 'rgba(0,0,0,0.18)', quoteBar: '#3DD6A3', quoteName: '#3DD6A3',
    },
  },
  sunset: {
    label: 'Sunset',
    swatch: ['#FF9F6E', '#D2461E'],
    light: {
      primary: '#C2441C', primaryPressed: '#A83A17', primarySoft: '#FDE7DF', primaryText: '#B03C17', onPrimary: '#FFFFFF',
      chipOn: '#FDE7DF', chipOnText: '#943213', tabPill: '#FDE7DF', tickRead: '#B03C17',
      chatBg: '#F6F0EC', wallpaperTint: '#9A7466',
      bubbleOut: '#FFE1D5', bubbleOutText: '#1F1411', bubbleOutMeta: '#725046', quoteOut: 'rgba(194,68,28,0.10)', quoteBar: '#C2441C', quoteName: '#B03C17',
    },
    dark: {
      primary: '#FF8A5C', primaryPressed: '#F07848', primarySoft: '#3A1E14', primaryText: '#FFA27D', onPrimary: '#2B0E03',
      chipOn: '#3A1E14', chipOnText: '#FFC2A8', tabPill: '#3A1E14', tickRead: '#FFC2A8',
      chatBg: '#0E0B0B', wallpaperTint: '#FFFFFF',
      bubbleOut: '#6E2E16', bubbleOutText: '#FFF2EC', bubbleOutMeta: '#E8C2B2', quoteOut: 'rgba(0,0,0,0.22)', quoteBar: '#FFA27D', quoteName: '#FFC2A8',
    },
  },
  rose: {
    label: 'Rose',
    swatch: ['#FF8FB8', '#C22E68'],
    light: {
      primary: '#C02C66', primaryPressed: '#A62457', primarySoft: '#FCE4EE', primaryText: '#AD285C', onPrimary: '#FFFFFF',
      chipOn: '#FCE4EE', chipOnText: '#931F4D', tabPill: '#FCE4EE', tickRead: '#AD285C',
      chatBg: '#F6EFF2', wallpaperTint: '#98707F',
      bubbleOut: '#FCDDEA', bubbleOutText: '#1F1418', bubbleOutMeta: '#744C5C', quoteOut: 'rgba(192,44,102,0.10)', quoteBar: '#C02C66', quoteName: '#AD285C',
    },
    dark: {
      primary: '#FF6FA5', primaryPressed: '#F05A92', primarySoft: '#3A1626', primaryText: '#FF8DB7', onPrimary: '#2E0717',
      chipOn: '#3A1626', chipOnText: '#FFB8D2', tabPill: '#3A1626', tickRead: '#FFB8D2',
      chatBg: '#0E0B0D', wallpaperTint: '#FFFFFF',
      bubbleOut: '#6E1F42', bubbleOutText: '#FFF0F5', bubbleOutMeta: '#EDBCD0', quoteOut: 'rgba(0,0,0,0.22)', quoteBar: '#FF8DB7', quoteName: '#FFB8D2',
    },
  },
  graphite: {
    label: 'Graphite',
    swatch: ['#8A90A0', '#2A2F3A'],
    light: {
      primary: '#2A2F3A', primaryPressed: '#1C2029', primarySoft: '#E7E9EE', primaryText: '#2A2F3A', onPrimary: '#FFFFFF',
      chipOn: '#2A2F3A', chipOnText: '#FFFFFF', tabPill: '#E7E9EE', tickRead: '#1F6FD1',
      chatBg: '#EFF0F2', wallpaperTint: '#6F7584',
      bubbleOut: '#E3E6EC', bubbleOutText: '#14141F', bubbleOutMeta: '#555B69', quoteOut: 'rgba(42,47,58,0.08)', quoteBar: '#2A2F3A', quoteName: '#2A2F3A',
    },
    dark: {
      primary: '#E4E7EE', primaryPressed: '#CDD1DA', primarySoft: '#262932', primaryText: '#E4E7EE', onPrimary: '#14161C',
      chipOn: '#E4E7EE', chipOnText: '#14161C', tabPill: '#262932', tickRead: '#8EC2FF',
      chatBg: '#0B0C10', wallpaperTint: '#FFFFFF',
      bubbleOut: '#2D313B', bubbleOutText: '#F2F3F6', bubbleOutMeta: '#B4B9C5', quoteOut: 'rgba(0,0,0,0.22)', quoteBar: '#E4E7EE', quoteName: '#E4E7EE',
    },
  },
};

export function buildTheme(dark: boolean, accent: AccentName): AppTheme {
  const a = ACCENTS[accent] ?? ACCENTS.iris;
  return {...(dark ? darkTheme : lightTheme), ...(dark ? a.dark : a.light)};
}

// ─── Store ────────────────────────────────────────────────────────────────────

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
  accent: AccentName;
  isDark: boolean;
  theme: AppTheme;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentName) => void;
  /** Re-read the system setting (called when it changes). */
  syncSystem: () => void;
}

function resolve(mode: ThemeMode): boolean {
  return mode === 'dark' || (mode === 'system' && Appearance.getColorScheme() === 'dark');
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'system',
  accent: 'iris',
  isDark: resolve('system'),
  theme: buildTheme(resolve('system'), 'iris'),
  setMode: mode => {
    const isDark = resolve(mode);
    set({mode, isDark, theme: buildTheme(isDark, get().accent)});
  },
  setAccent: accent => {
    const a = accent in ACCENTS ? accent : 'iris';
    set({accent: a, theme: buildTheme(get().isDark, a)});
  },
  syncSystem: () => get().setMode(get().mode),
}));
