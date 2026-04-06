import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchEveningTokens } from '../../lib/api';

export default function EveningTokensPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEveningTokens()
      .then(setTokens)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>EVENINGS</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : tokens.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: c.text }]}>No evenings yet</Text>
            <Text style={[styles.emptyBody, { color: c.muted }]}>
              When you and a companion both choose to remember an evening together,
              a token is minted here — a quiet record of a shared night.
            </Text>
          </View>
        ) : (
          tokens.map((token: any) => (
            <View
              key={token.id}
              style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
            >
              <Text style={[styles.tokenNumber, { color: c.muted }]}>
                #{String(token.booking_id).padStart(4, '0')}
              </Text>
              <Text style={[styles.restaurantName, { color: c.text }]}>
                {token.business_name}
              </Text>
              {token.offer_title ? (
                <Text style={[styles.offerTitle, { color: c.muted }]}>{token.offer_title}</Text>
              ) : null}
              {token.offer_date ? (
                <Text style={[styles.date, { color: c.muted }]}>
                  {new Date(token.offer_date).toLocaleDateString('en-CA', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </Text>
              ) : null}
              <Text style={[styles.companion, { color: c.accent }]}>
                with {token.companion_name}
              </Text>
              {token.minted_at ? (
                <Text style={[styles.mintedAt, { color: c.muted }]}>
                  remembered {new Date(token.minted_at).toLocaleDateString('en-CA', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40 },
  backText: { fontSize: 22 },
  title: {
    fontFamily: fonts.dmMono,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  scroll: {
    padding: SPACING.md,
    paddingBottom: 60,
  },
  empty: {
    marginTop: 60,
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  emptyTitle: {
    fontFamily: fonts.playfair,
    fontSize: 20,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    gap: 4,
  },
  tokenNumber: {
    fontFamily: fonts.dmMono,
    fontSize: 10,
    letterSpacing: 1,
  },
  restaurantName: {
    fontFamily: fonts.playfair,
    fontSize: 20,
    marginTop: 2,
  },
  offerTitle: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    lineHeight: 20,
  },
  date: {
    fontFamily: fonts.dmMono,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  companion: {
    fontFamily: fonts.dmMono,
    fontSize: 11,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  mintedAt: {
    fontFamily: fonts.dmMono,
    fontSize: 10,
    letterSpacing: 0.3,
    marginTop: 2,
  },
});
