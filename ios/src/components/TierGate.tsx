import React, { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, fonts, SPACING } from '../theme';
import { useSocialAccess, SocialTier, TIER_LABELS } from './SocialGate';
import type { PanelId } from '../context/PanelContext';

// ─── Tier rank ────────────────────────────────────────────────────────────────

const TIER_RANK: Record<string, number> = { standard: 1, reserve: 2, estate: 3 };

function tierRank(tier: SocialTier): number {
  return TIER_RANK[tier ?? ''] ?? 0;
}

export function tierMeets(tier: SocialTier, required: SocialTier): boolean {
  return true;
}

// ─── Panel tier requirements ──────────────────────────────────────────────────
// null = no social access needed at all (pre-gate panels)
// 'standard' = any active box holder
// 'reserve'  = reserve or estate box
// 'estate'   = estate box only

export const PANEL_TIER_REQUIREMENTS: Partial<Record<PanelId, SocialTier>> = {
  'my-profile':   'standard',
  'staff-orders': 'estate',
};

// ─── TierGate component ───────────────────────────────────────────────────────

interface TierGateProps {
  required: SocialTier;
  children: ReactNode;
  panelName?: string;
}

export function TierGate({ required, children, panelName }: TierGateProps) {
  const { tier } = useSocialAccess();
  const c = useColors();
  const insets = useSafeAreaInsets();

  if (tierMeets(tier, required)) return <>{children}</>;

  const requiredLabel = required ? (TIER_LABELS[required] ?? required) : '';

  return (
    <View style={[styles.center, { backgroundColor: c.panelBg, paddingTop: insets.top }]}>
      <Text style={[styles.kanji, { color: c.accent }]}>苺</Text>
      <Text style={[styles.title, { color: c.text, fontFamily: fonts.playfair }]}>
        {requiredLabel} access required.
      </Text>
      <Text style={[styles.body, { color: c.muted, fontFamily: fonts.dmSans }]}>
        Tap a {requiredLabel.toLowerCase()} or higher grade box{'\n'}to unlock{panelName ? ` ${panelName}` : ' this feature'}.
      </Text>
    </View>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTierGate(required: SocialTier): boolean {
  const { tier } = useSocialAccess();
  return tierMeets(tier, required);
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  kanji: { fontSize: 48, marginBottom: SPACING.lg },
  title: { fontSize: 20, marginBottom: SPACING.sm, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 22, textAlign: 'center', opacity: 0.7 },
});
