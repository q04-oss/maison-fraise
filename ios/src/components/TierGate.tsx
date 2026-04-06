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
  if (!required) return true;
  return tierRank(tier) >= tierRank(required);
}

// ─── Panel tier requirements ──────────────────────────────────────────────────
// null = no social access needed at all (pre-gate panels)
// 'standard' = any active box holder
// 'reserve'  = reserve or estate box
// 'estate'   = estate box only

export const PANEL_TIER_REQUIREMENTS: Partial<Record<PanelId, SocialTier>> = {
  // Standard — any box holder
  'editorial-feed':       'standard',
  'editorial-piece':      'standard',
  'ar-video-detail':      'standard',
  'tasting-journal':      'standard',
  'conversations':        'standard',
  'messageThread':        'standard',
  'leaderboard':          'standard',
  'my-profile':           'standard',
  'user-profile':         'standard',
  'notifications':        'standard',
  'ventures':             'standard',
  'venture-detail':       'standard',
  'venture-create':       'standard',
  'venture-manage':       'standard',
  'venture-earnings':     'standard',
  'discovery':            'standard',

  // Reserve — quality box required
  'collectif-list':             'reserve',
  'collectif-detail':           'reserve',
  'collectif-create':           'reserve',
  'market':                     'reserve',
  'market-home':                'reserve',
  'market-cart':                'reserve',
  'market-orders':              'reserve',
  'market-stall':               'reserve',
  'market-vendor':              'reserve',
  'drops':                      'reserve',
  'drop-detail':                'reserve',
  'preorders':                  'reserve',
  'bundles':                    'reserve',
  'nomination':                 'reserve',
  'nomination-history':         'reserve',
  'greenhouse':                 'reserve',
  'greenhouse-detail':          'reserve',
  'seasonal-calendar':          'reserve',
  'write-piece':                'reserve',
  'submit-ar-video':            'reserve',
  'ar-video-feed':              'reserve',
  'proposals':                  'reserve',
  'reservation-offers':         'reserve',
  'reservation-discovery':      'reserve',
  'reservation-booking':        'reserve',
  'portrait-feed':              'reserve',
  'portrait-tokens':            'reserve',
  'portrait-token-detail':      'reserve',
  'portrait-licensing':         'reserve',
  'evening-tokens':             'reserve',
  'tokens':                     'reserve',
  'token-detail':               'reserve',
  'fraise-chat-inbox':          'reserve',
  'transfers':                  'reserve',
  'referral':                   'reserve',

  // Estate — top-grade box required
  'variety-passport':       'estate',
  'farm-visits':            'estate',
  'creator-earnings':       'estate',
  'tournament-operator':    'estate',
  'tournaments':            'estate',
  'tournament-detail':      'estate',
  'campaign-commission':    'estate',
  'ad-campaigns':           'estate',
  'variety-management':     'estate',
  'supplier-harvest':       'estate',
  'nutrition-dashboard':    'estate',
  'webhooks':               'estate',
  'staff-orders':           'estate',
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
