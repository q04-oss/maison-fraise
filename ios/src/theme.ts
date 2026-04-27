import { useTheme } from './context/ThemeContext';

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

// No accent colour — hierarchy through typography, size, and opacity only.
// accent = text, so all former accent references become black/white.
// Primary buttons invert: text-coloured bg, ctaText-coloured label.
export const lightColors = {
  accent: '#1C1C1E',
  background: '#FFFFFF',
  bg: '#FFFFFF',
  card: '#F7F5F2',
  cardDark: '#EEEBE6',
  text: '#1C1C1E',
  muted: '#8E8E93',
  border: '#E5E1DA',
  panelBg: '#FFFFFF',
  sheetBg: '#FFFFFF',
  optionCard: '#F7F5F2',
  optionCardBorder: '#E5E1DA',
  stripBg: '#F7F5F2',
  searchBg: '#F0EDE8',
  searchBorder: '#E5E1DA',
  pillBg: '#F0EDE8',
  pillBorder: '#E5E1DA',
  ctaText: '#FFFFFF',
  markerBg: '#1C1C1E',
  markerBorder: '#1C1C1E',
};

export const darkColors = {
  accent: '#F2F2F7',
  background: '#1C1C1E',
  bg: '#1C1C1E',
  card: 'rgba(44,44,46,0.92)',
  cardDark: 'rgba(255,255,255,0.09)',
  text: '#F2F2F7',
  muted: '#8E8E93',
  border: 'rgba(255,255,255,0.13)',
  panelBg: '#1C1C1E',
  sheetBg: '#1C1C1E',
  optionCard: 'rgba(44,44,46,0.92)',
  optionCardBorder: 'rgba(255,255,255,0.11)',
  stripBg: 'rgba(255,255,255,0.07)',
  searchBg: 'rgba(255,255,255,0.09)',
  searchBorder: 'rgba(255,255,255,0.13)',
  pillBg: 'rgba(255,255,255,0.09)',
  pillBorder: 'rgba(255,255,255,0.13)',
  ctaText: '#1C1C1E',
  markerBg: '#F2F2F7',
  markerBorder: '#F2F2F7',
};

export function useColors() {
  const { isDark } = useTheme();
  return isDark ? darkColors : lightColors;
}

export const fonts = {
  playfair: 'DMMono_400Regular',
  playfairItalic: 'DMMono_400Regular',
  dmSans: 'DMMono_400Regular',
  body: 'DMMono_400Regular',
  dmMono: 'DMMono_400Regular',
  dmMonoMedium: 'DMMono_500Medium',
};

// Type scale — use these instead of ad-hoc font sizes
export const type = {
  title:    { fontFamily: 'DMMono_500Medium', fontSize: 26, lineHeight: 32 },
  heading:  { fontFamily: 'DMMono_500Medium', fontSize: 18, lineHeight: 24 },
  body:     { fontFamily: 'DMMono_400Regular', fontSize: 14, lineHeight: 21 },
  label:    { fontFamily: 'DMMono_400Regular', fontSize: 12, lineHeight: 18 },
  small:    { fontFamily: 'DMMono_400Regular', fontSize: 11, lineHeight: 16 },
  eyebrow:  { fontFamily: 'DMMono_400Regular', fontSize: 10, lineHeight: 14, letterSpacing: 2 },
};
