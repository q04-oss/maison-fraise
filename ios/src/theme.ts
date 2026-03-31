import { useTheme } from './context/ThemeContext';

// Legacy — only used for App.tsx loading screen
export const COLORS = {
  forestGreen: '#1C3A2A',
  cream: '#FFFFFF',
  cardBg: '#F2F2F7',
  highlightCardBg: '#F2F2F7',
  textDark: '#1C1C1E',
  textMuted: '#8E8E93',
  accentGold: '#C4973A',
  white: '#FFFFFF',
  border: '#E5E5EA',
  greenBadgeBg: '#D4EDD4',
  greenBadgeText: '#2D5A2D',
  chocolateDark: '#2C1810',
  strawberryRed: '#CC3333',
  leafGreen: '#2D5A2D',
  separator: '#E5E5EA',
};

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
  bg: 'transparent',
  card: 'rgba(255,255,255,0.75)',
  cardDark: 'rgba(60,60,67,0.07)',
  text: '#1C1C1E',
  muted: '#8E8E93',
  border: 'rgba(60,60,67,0.14)',
  panelBg: 'transparent',
  optionCard: 'rgba(255,255,255,0.75)',
  optionCardBorder: 'rgba(60,60,67,0.12)',
  stripBg: 'rgba(60,60,67,0.07)',
  searchBg: 'rgba(60,60,67,0.07)',
  searchBorder: 'rgba(60,60,67,0.12)',
  pillBg: 'rgba(60,60,67,0.07)',
  pillBorder: 'rgba(60,60,67,0.12)',
  ctaText: '#FFFFFF',
  markerBg: '#C9973A',
  markerBorder: '#C9973A',
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
  optionCard: 'rgba(44,44,46,0.92)',
  optionCardBorder: 'rgba(255,255,255,0.11)',
  stripBg: 'rgba(255,255,255,0.07)',
  searchBg: 'rgba(255,255,255,0.09)',
  searchBorder: 'rgba(255,255,255,0.13)',
  pillBg: 'rgba(255,255,255,0.09)',
  pillBorder: 'rgba(255,255,255,0.13)',
  ctaText: '#1C1C1E',
  markerBg: '#D4A843',
  markerBorder: '#D4A843',
};

export const colors = lightColors;

export function useColors() {
  const { isDark } = useTheme();
  return isDark ? darkColors : lightColors;
}

export const fonts = {
  playfair: 'PlayfairDisplay_700Bold',
  playfairRegular: 'PlayfairDisplay_400Regular',
  playfairItalic: 'PlayfairDisplay_400Regular_Italic',
  dmSans: 'DMSans_400Regular',
  dmSansMedium: 'DMSans_500Medium',
  dmMono: 'DMMono_400Regular',
};
