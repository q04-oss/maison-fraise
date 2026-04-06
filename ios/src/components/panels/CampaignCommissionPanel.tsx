import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useStripe } from '@stripe/stripe-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import {
  fetchNominationLeaderboard,
  createCampaignCommission,
  createCampaignCommissionIntent,
} from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

type LeaderboardEntry = { user_id: number; display_name: string; nomination_count: number };

export default function CampaignCommissionPanel() {
  const { goHome, activeLocation, panelData } = usePanel();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const biz = activeLocation;
  const isPaymentOnly = !!(panelData?.amount_cents);

  const [userDbId, setUserDbId] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(!isPaymentOnly);
  const [paying, setPaying] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('user_db_id').then(stored => {
      if (stored) setUserDbId(parseInt(stored, 10));
    });

    if (isPaymentOnly || !biz) {
      setLoading(false);
      return;
    }

    fetchNominationLeaderboard(biz.id)
      .then(data => {
        setLeaderboard(data);
        // pre-select all
        setSelected(new Set(data.map(e => e.user_id)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [biz?.id]);

  const toggleEntry = (userId: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handlePaymentOnly = async () => {
    if (!panelData?.amount_cents) return;
    setPaying(true);
    try {
      const uid = userDbId ?? 0;
      const { client_secret } = await createCampaignCommissionIntent({
        amount_cents: panelData.amount_cents,
        campaign_name: panelData.campaign_name ?? 'Campaign',
        user_id: uid,
      });
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Maison Fraise',
        paymentIntentClientSecret: client_secret,
        appearance: { colors: { primary: '#8B4513' } },
      });
      if (initError) throw new Error(initError.message);
      const { error: payError } = await presentPaymentSheet();
      if (payError) {
        if (payError.code !== 'Canceled') {
          Alert.alert('Payment failed', payError.message);
        }
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmed(true);
    } catch (err: any) {
      Alert.alert('Could not process payment', err.message ?? 'Try again.');
    } finally {
      setPaying(false);
    }
  };

  const handleCommission = async () => {
    if (!biz) return;
    setPaying(true);
    try {
      const invited_user_ids = Array.from(selected);
      const { client_secret } = await createCampaignCommission({
        popup_id: biz.id,
        invited_user_ids,
      });
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Maison Fraise',
        paymentIntentClientSecret: client_secret,
        appearance: { colors: { primary: '#8B4513' } },
      });
      if (initError) throw new Error(initError.message);
      const { error: payError } = await presentPaymentSheet();
      if (payError) {
        if (payError.code !== 'Canceled') {
          Alert.alert('Payment failed', payError.message);
        }
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmed(true);
    } catch (err: any) {
      Alert.alert('Could not commission campaign', err.message ?? 'Try again.');
    } finally {
      setPaying(false);
    }
  };

  if (confirmed) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.confirmedBody, { paddingBottom: insets.bottom || SPACING.lg }]}>
          <Text style={[styles.kanji, { color: c.text }]}>肖</Text>
          {isPaymentOnly ? (
            <>
              <Text style={[styles.confirmedTitle, { color: c.text }]}>Commission paid. Thank you.</Text>
            </>
          ) : (
            <>
              <Text style={[styles.confirmedTitle, { color: c.text }]}>Campaign commissioned.</Text>
              <Text style={[styles.confirmedSub, { color: c.muted }]}>
                We'll coordinate the portrait session and reach out to your guests. Your pin goes live the night of the launch DJ set.
              </Text>
            </>
          )}
          <TouchableOpacity
            style={[styles.borderBtn, { borderColor: c.border }]}
            onPress={goHome}
            activeOpacity={0.7}
          >
            <Text style={[styles.borderBtnText, { color: c.text }]}>Back to home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Payment-only mode
  if (isPaymentOnly) {
    const amountLabel = `CA$${(panelData.amount_cents / 100).toFixed(2)}`;
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <View style={styles.headerSpacer} />
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: c.text }]}>Campaign Commission</Text>
            {!!panelData.campaign_name && (
              <Text style={[styles.headerSub, { color: c.muted }]}>{panelData.campaign_name}</Text>
            )}
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.paymentOnlyBody}>
          <Text style={[styles.amountLabel, { color: c.muted }]}>AMOUNT DUE</Text>
          <Text style={[styles.amountValue, { color: c.text }]}>{amountLabel}</Text>
        </View>

        <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: c.accent }]}
            onPress={handlePaymentOnly}
            disabled={paying}
            activeOpacity={0.8}
          >
            {paying
              ? <ActivityIndicator color="#fff" />
              : <Text style={[styles.ctaText, { color: '#fff' }]}>Pay {amountLabel}</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Full nomination mode
  if (!biz) return null;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <View style={styles.headerSpacer} />
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: c.text }]}>Your community said yes.</Text>
          <Text style={[styles.headerSub, { color: c.muted }]}>{biz.name}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {/* Explainer */}
          <View style={[styles.explainerBlock, { borderBottomColor: c.border }]}>
            <Text style={[styles.explainerText, { color: c.muted }]}>
              To earn your permanent pin, commission the inaugural portrait campaign. Choose who from that night will be photographed — black and white, no product, credited Maison Fraise × {biz.name}.
            </Text>
          </View>

          {/* Leaderboard checkboxes */}
          {leaderboard.map((entry, idx) => {
            const isChecked = selected.has(entry.user_id);
            return (
              <TouchableOpacity
                key={entry.user_id}
                style={[styles.nomineeRow, { borderBottomColor: c.border }]}
                onPress={() => toggleEntry(entry.user_id)}
                activeOpacity={0.7}
              >
                <View style={styles.nomineeInfo}>
                  <Text style={[styles.nomineeName, { color: c.text }]}>{entry.display_name}</Text>
                  <Text style={[styles.nomineeCount, { color: c.muted }]}>
                    {entry.nomination_count} nomination{entry.nomination_count !== 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={[
                  styles.checkbox,
                  {
                    borderColor: isChecked ? c.accent : c.border,
                    backgroundColor: isChecked ? c.accent : 'transparent',
                  },
                ]}>
                  {isChecked && <Text style={styles.checkboxTick}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}

          {leaderboard.length === 0 && (
            <Text style={[styles.emptyText, { color: c.muted }]}>No nominations recorded.</Text>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: c.accent }]}
          onPress={handleCommission}
          disabled={paying || selected.size === 0}
          activeOpacity={0.8}
        >
          {paying
            ? <ActivityIndicator color="#fff" />
            : <Text style={[styles.ctaText, { color: '#fff' }]}>Commission the campaign</Text>
          }
        </TouchableOpacity>
        <Text style={[styles.footerHint, { color: c.muted }]}>
          The portrait session is coordinated by Maison Fraise. Your pin goes live the night of the launch DJ set.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSpacer: { width: 40 },
  headerCenter: { flex: 1, alignItems: 'center', gap: 3 },
  headerTitle: { fontSize: 20, fontFamily: fonts.playfair, textAlign: 'center' },
  headerSub: { fontSize: 12, fontFamily: fonts.dmMono, textAlign: 'center' },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },

  explainerBlock: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  explainerText: {
    fontSize: 14,
    fontFamily: fonts.dmSans,
    lineHeight: 22,
  },

  nomineeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACING.sm,
  },
  nomineeInfo: { flex: 1, gap: 3 },
  nomineeName: { fontSize: 16, fontFamily: fonts.playfair },
  nomineeCount: { fontSize: 11, fontFamily: fonts.dmMono },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxTick: { fontSize: 12, color: '#fff', fontFamily: fonts.dmSans },

  emptyText: {
    fontSize: 14,
    fontFamily: fonts.dmSans,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },

  footer: {
    padding: SPACING.md,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  cta: {
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700' },
  footerHint: {
    fontSize: 11,
    fontFamily: fonts.dmSans,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Payment-only mode
  paymentOnlyBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  amountLabel: {
    fontSize: 10,
    fontFamily: fonts.dmMono,
    letterSpacing: 1.5,
  },
  amountValue: { fontSize: 32, fontFamily: fonts.playfair },

  // Confirmed state
  confirmedBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    gap: 12,
  },
  kanji: { fontSize: 64, fontFamily: fonts.playfair, marginBottom: 8 },
  confirmedTitle: { fontSize: 24, fontFamily: fonts.playfair, textAlign: 'center' },
  confirmedSub: {
    fontSize: 14,
    fontFamily: fonts.dmSans,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  borderBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  borderBtnText: { fontSize: 15, fontFamily: fonts.dmSans },
});
