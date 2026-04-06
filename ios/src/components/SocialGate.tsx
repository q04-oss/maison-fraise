import React, { useEffect, useState, createContext, useContext, ReactNode } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, fonts, SPACING } from '../theme';
import { fetchSocialAccess } from '../lib/api';

type SocialTier = 'standard' | 'reserve' | 'estate' | null;

const TIER_LABELS: Record<string, string> = {
  standard: 'Standard',
  reserve: 'Reserve',
  estate: 'Estate',
};

interface SocialAccessCtx {
  active: boolean;
  expires_at: string | null;
  tier: SocialTier;
  loading: boolean;
  refresh: () => void;
}

const SocialAccessContext = createContext<SocialAccessCtx>({
  active: false, expires_at: null, tier: null, loading: true, refresh: () => {},
});

export function SocialAccessProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [expires_at, setExpiresAt] = useState<string | null>(null);
  const [tier, setTier] = useState<SocialTier>(null);
  const [loading, setLoading] = useState(true);

  const check = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) { setActive(false); setTier(null); setLoading(false); return; }
      const data = await fetchSocialAccess();
      setActive(data.active);
      setExpiresAt(data.expires_at);
      setTier((data.tier as SocialTier) ?? null);
    } catch {
      setActive(false);
      setTier(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { check(); }, []);

  return (
    <SocialAccessContext.Provider value={{ active, expires_at, tier, loading, refresh: check }}>
      {children}
    </SocialAccessContext.Provider>
  );
}

export function useSocialAccess() {
  return useContext(SocialAccessContext);
}

// Gate wrapper — shows blocked screen if social access is inactive
export function SocialGate({ children }: { children: ReactNode }) {
  const { active, tier, loading } = useSocialAccess();
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
          Your access has expired.{'\n'}NFC-tap a fresh box to re-unlock.
        </Text>
      </View>
    );
  }

  return (
    <>
      {tier ? (
        <View style={[styles.tierBadge, { borderColor: c.accent }]}>
          <Text style={[styles.tierText, { color: c.accent, fontFamily: fonts.dmMono }]}>
            {TIER_LABELS[tier] ?? tier}
          </Text>
        </View>
      ) : null}
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  kanji: { fontSize: 64, marginBottom: SPACING.lg },
  title: { fontSize: 22, marginBottom: SPACING.sm, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 22, textAlign: 'center', opacity: 0.7 },
  tierBadge: {
    position: 'absolute', top: 0, right: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, zIndex: 10,
  },
  tierText: { fontSize: 11, letterSpacing: 1 },
});
