import { useTheme } from './context/ThemeContext';

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

// Warm amber — references the Claude terminal's warmth + the Or Fin gold finish
// Used as primary action colour across all panels
export const lightColors = {
  accent: '#C9973A',
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
  markerBg: '#A0522D',
  markerBorder: '#A0522D',
};

export const darkColors = {
  accent: '#D4A843',
  bg: 'transparent',
  card: 'rgba(28,28,30,0.92)',
  cardDark: 'rgba(255,255,255,0.09)',
  text: '#F2F2F7',
  muted: '#8E8E93',
  border: 'rgba(255,255,255,0.13)',
  panelBg: 'transparent',
  sheetBg: '#1C1C1E',
  optionCard: 'rgba(44,44,46,0.92)',
  optionCardBorder: 'rgba(255,255,255,0.11)',
  stripBg: 'rgba(255,255,255,0.07)',
  searchBg: 'rgba(255,255,255,0.09)',
  searchBorder: 'rgba(255,255,255,0.13)',
  pillBg: 'rgba(255,255,255,0.09)',
  pillBorder: 'rgba(255,255,255,0.13)',
  ctaText: '#1C1C1E',
  markerBg: '#A0522D',
  markerBorder: '#A0522D',
};

export function useColors() {
  const { isDark } = useTheme();
  return isDark ? darkColors : lightColors;
}

export const fonts = {
  playfair: 'PlayfairDisplay_700Bold',
  playfairItalic: 'PlayfairDisplay_400Regular_Italic',
  dmSans: 'DMSans_400Regular',
  dmMono: 'DMMono_400Regular',
};
