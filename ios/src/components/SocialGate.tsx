import React, { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, fonts, SPACING } from '../theme';
import { fetchSocialAccess } from '../lib/api';

export type SocialTier = 'standard' | 'reserve' | 'estate' | null;

export const TIER_LABELS: Record<string, string> = {
  standard: 'Standard',
  reserve: 'Reserve',
  estate: 'Estate',
};

interface SocialAccessCtx {
  active: boolean;
  tier: SocialTier;
  bankDays: number;
  lifetimeDays: number;
  loading: boolean;
  refresh: () => void;
}

const SocialAccessContext = createContext<SocialAccessCtx>({
  active: false, tier: null, bankDays: 0, lifetimeDays: 0, loading: true, refresh: () => {},
});

export function SocialAccessProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [tier, setTier] = useState<SocialTier>(null);
  const [bankDays, setBankDays] = useState(0);
  const [lifetimeDays, setLifetimeDays] = useState(0);
  const [loading, setLoading] = useState(true);

  const check = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) { setActive(false); setTier(null); setBankDays(0); setLoading(false); return; }
      const data = await fetchSocialAccess();
      setActive(data.active);
      setTier((data.tier as SocialTier) ?? null);
      setBankDays(data.bank_days ?? 0);
      setLifetimeDays(data.lifetime_days ?? 0);
    } catch {
      setActive(false);
      setTier(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { check(); }, []);

  return (
    <SocialAccessContext.Provider value={{ active, tier, bankDays, lifetimeDays, loading, refresh: check }}>
      {children}
    </SocialAccessContext.Provider>
  );
}

export function useSocialAccess() {
  return useContext(SocialAccessContext);
}

// Gate wrapper — shows blocked screen when bank is empty
export function SocialGate({ children }: { children: ReactNode }) {
  const { active, tier, bankDays, loading } = useSocialAccess();
  const c = useColors();
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.panelBg }]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  if (!active) {
    return (
      <View style={[styles.center, { backgroundColor: c.panelBg, paddingTop: insets.top }]}>
        <Text style={[styles.kanji, { color: c.accent }]}>苺</Text>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.playfair }]}>
          Tap your next box.
        </Text>
        <Text style={[styles.body, { color: c.muted, fontFamily: fonts.dmSans }]}>
          Your time has run out.{'\n'}NFC-tap a fresh box to re-enter.
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.tierBar, { borderBottomColor: c.border }]}>
        <Text style={[styles.tierLabel, { color: c.accent, fontFamily: fonts.dmMono }]}>
          {tier ? TIER_LABELS[tier] : '—'}
        </Text>
        <Text style={[styles.bankDays, { color: c.muted, fontFamily: fonts.dmMono }]}>
          {bankDays}d
        </Text>
      </View>
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  kanji: { fontSize: 64, marginBottom: SPACING.lg },
  title: { fontSize: 22, marginBottom: SPACING.sm, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 22, textAlign: 'center', opacity: 0.7 },
  tierBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tierLabel: { fontSize: 11, letterSpacing: 1.5 },
  bankDays: { fontSize: 11, letterSpacing: 0.5 },
});
