import { useTheme } from './context/ThemeContext';

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

export const lightColors = {
  accent: '#007AFF',
  bg: 'transparent',
  card: 'rgba(255,255,255,0.65)',
  cardDark: 'rgba(60,60,67,0.06)',
  text: '#000000',
  muted: '#8E8E93',
  border: 'rgba(60,60,67,0.12)',
  panelBg: 'transparent',
  optionCard: 'rgba(255,255,255,0.65)',
  optionCardBorder: 'rgba(60,60,67,0.1)',
  stripBg: 'rgba(60,60,67,0.06)',
  searchBg: 'rgba(60,60,67,0.06)',
  searchBorder: 'rgba(60,60,67,0.1)',
  pillBg: 'rgba(60,60,67,0.06)',
  pillBorder: 'rgba(60,60,67,0.1)',
  ctaText: '#FFFFFF',
  markerBg: '#000000',
  markerBorder: '#000000',
};

export const darkColors = {
  accent: '#0A84FF',
  bg: 'transparent',
  card: 'rgba(28,28,30,0.85)',
  cardDark: 'rgba(255,255,255,0.08)',
  text: '#FFFFFF',
  muted: '#8E8E93',
  border: 'rgba(255,255,255,0.12)',
  panelBg: 'transparent',
  optionCard: 'rgba(44,44,46,0.85)',
  optionCardBorder: 'rgba(255,255,255,0.1)',
  stripBg: 'rgba(255,255,255,0.06)',
  searchBg: 'rgba(255,255,255,0.08)',
  searchBorder: 'rgba(255,255,255,0.12)',
  pillBg: 'rgba(255,255,255,0.08)',
  pillBorder: 'rgba(255,255,255,0.12)',
  ctaText: '#000000',
  markerBg: '#FFFFFF',
  markerBorder: '#FFFFFF',
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
