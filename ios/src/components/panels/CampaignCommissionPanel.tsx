import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStripe } from '@stripe/stripe-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { fetchNominationLeaderboard, createCampaignCommission, createCampaignCommissionIntent } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

export default function CampaignCommissionPanel() {
  const { goHome, activeLocation, panelData } = usePanel();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [userDbId, setUserDbId] = useState<number | null>(null);
  const [nominees, setNominees] = useState<{ user_id: number; display_name: string; nomination_count: number }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [commissioning, setCommissioning] = useState(false);
  const [commissioned, setCommissioned] = useState(false);

  // Amount-based commission flow (from panelData)
  const amountCents: number | undefined = panelData?.amount_cents;
  const campaignName: string | undefined = panelData?.campaign_name;

  const biz = activeLocation;

  useEffect(() => {
    if (!biz) { setLoading(false); return; }
    AsyncStorage.getItem('user_db_id').then(async stored => {
      if (!stored) { setLoading(false); return; }
      const uid = parseInt(stored, 10);
      setUserDbId(uid);
      try {
        const board = await fetchNominationLeaderboard(biz.id);
        setNominees(board);
        // Pre-select all nominees by default
        setSelectedIds(new Set(board.map(n => n.user_id)));
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    });
  }, [biz?.id]);

  const toggleNominee = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePayCommission = async () => {
    if (!userDbId || !amountCents || !campaignName) return;
    setCommissioning(true);
    try {
      const { client_secret } = await createCampaignCommissionIntent({
        amount_cents: amountCents,
        campaign_name: campaignName,
        user_id: userDbId,
      });
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Maison Fraise',
        paymentIntentClientSecret: client_secret,
        appearance: { colors: { primary: '#8B4513' } },
      });
      if (initError) throw new Error(initError.message);
      const { error: payError } = await presentPaymentSheet();
      if (payError) {
        if (payError.code !== 'Canceled') Alert.alert('Payment failed', payError.message);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCommissioned(true);
    } catch (err: any) {
      Alert.alert('Could not process payment', err.message ?? 'Try again.');
    } finally {
      setCommissioning(false);
    }
  };

  const handleCommission = async () => {
    if (!biz || !userDbId) return;
    if (selectedIds.size === 0) {
      Alert.alert('Select at least one person', 'Choose who will be photographed for the campaign.');
      return;
    }
    setCommissioning(true);
    try {
      const { client_secret } = await createCampaignCommission({
        popup_id: biz.id,
        user_id: userDbId,
        invited_user_ids: Array.from(selectedIds),
      });
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Maison Fraise',
        paymentIntentClientSecret: client_secret,
        appearance: { colors: { primary: '#8B4513' } },
      });
      if (initError) throw new Error(initError.message);
      const { error: payError } = await presentPaymentSheet();
      if (payError) {
        if (payError.code !== 'Canceled') Alert.alert('Payment failed', payError.message);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCommissioned(true);
    } catch (err: any) {
      Alert.alert('Could not commission', err.message ?? 'Try again.');
    } finally {
      setCommissioning(false);
    }
  };

  // Amount-based commission payment UI
  if (amountCents !== undefined && campaignName !== undefined) {
    const amountDisplay = `CA$${(amountCents / 100).toFixed(2)}`;
    if (commissioned) {
      return (
        <View style={[styles.container, { backgroundColor: c.panelBg }]}>
          <View style={styles.centeredBody}>
            <Text style={[styles.successKanji, { color: c.border }]}>肖</Text>
            <Text style={[styles.successTitle, { color: c.text }]}>Commission paid. Thank you.</Text>
            <TouchableOpacity
              style={[styles.successBtn, { borderColor: c.border }]}
              onPress={goHome}
              activeOpacity={0.75}
            >
              <Text style={[styles.successBtnText, { color: c.accent }]}>Back to home</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <View style={styles.headerSpacer} />
          <View style={styles.headerCenter}>
            <Text style={[styles.title, { color: c.text }]}>Campaign Commission</Text>
            <Text style={[styles.subtitle, { color: c.muted }]}>{campaignName}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
        <View style={[styles.block, { borderBottomColor: c.border }]}>
          <Text style={[styles.blockText, { color: c.muted }]}>
            Pay your agreed commission for this campaign.
          </Text>
        </View>
        <View style={[styles.amountRow, { borderBottomColor: c.border }]}>
          <Text style={[styles.amountLabel, { color: c.muted }]}>AMOUNT DUE</Text>
          <Text style={[styles.amountValue, { color: c.text }]}>{amountDisplay}</Text>
        </View>
        <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: c.accent }]}
            onPress={handlePayCommission}
            disabled={commissioning || !userDbId}
            activeOpacity={0.8}
          >
            {commissioning
              ? <ActivityIndicator color="#fff" />
              : <Text style={[styles.ctaText, { color: '#fff' }]}>Pay {amountDisplay}</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!biz) return null;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <ActivityIndicator color={c.accent} style={{ marginTop: 80 }} />
      </View>
    );
  }

  if (commissioned) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={styles.centeredBody}>
          <Text style={[styles.successKanji, { color: c.border }]}>肖</Text>
          <Text style={[styles.successTitle, { color: c.text }]}>Campaign commissioned.</Text>
          <Text style={[styles.successSub, { color: c.muted }]}>
            We'll coordinate the portrait session and reach out to your guests. Your pin goes live the night of the launch.
          </Text>
          <TouchableOpacity
            style={[styles.successBtn, { borderColor: c.border }]}
            onPress={goHome}
            activeOpacity={0.75}
          >
            <Text style={[styles.successBtnText, { color: c.accent }]}>Back to home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <View style={styles.headerSpacer} />
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: c.text }]}>Your community said yes.</Text>
          <Text style={[styles.subtitle, { color: c.muted }]}>{biz.name}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.block, { borderBottomColor: c.border }]}>
          <Text style={[styles.blockText, { color: c.muted }]}>
            To earn your permanent pin, commission the inaugural portrait campaign. Choose who from that night will be photographed — black and white, no product, credited Maison Fraise × {biz.name}.
          </Text>
        </View>

        {/* Nominee selection */}
        {nominees.length > 0 && (
          <View style={styles.nomineeSection}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>NOMINATED FROM THAT NIGHT</Text>
            <Text style={[styles.sectionHint, { color: c.muted }]}>
              All are selected by default. Deselect anyone you'd like to exclude.
            </Text>
            {nominees.map((n, i) => {
              const selected = selectedIds.has(n.user_id);
              const isLast = i === nominees.length - 1;
              return (
                <TouchableOpacity
                  key={n.user_id}
                  style={[
                    styles.nomineeRow,
                    { borderBottomColor: c.border },
                    isLast && styles.nomineeRowLast,
                    selected && { backgroundColor: `${c.accent}08` },
                  ]}
                  onPress={() => toggleNominee(n.user_id)}
                  activeOpacity={0.75}
                >
                  <View style={styles.nomineeInfo}>
                    <Text style={[styles.nomineeName, { color: c.text }]}>{n.display_name}</Text>
                    <Text style={[styles.nomineeCount, { color: c.muted }]}>
                      {n.nomination_count} nomination{n.nomination_count !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <View style={[
                    styles.nomineeCheckbox,
                    { borderColor: selected ? c.accent : c.border, backgroundColor: selected ? c.accent : 'transparent' },
                  ]}>
                    {selected && <Text style={styles.nomineeCheckmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: selectedIds.size > 0 ? c.accent : c.card, borderWidth: selectedIds.size > 0 ? 0 : StyleSheet.hairlineWidth, borderColor: c.border }]}
          onPress={handleCommission}
          disabled={commissioning || selectedIds.size === 0}
          activeOpacity={0.8}
        >
          {commissioning
            ? <ActivityIndicator color="#fff" />
            : <Text style={[styles.ctaText, { color: selectedIds.size > 0 ? '#fff' : c.muted }]}>
                Commission the campaign
              </Text>
          }
        </TouchableOpacity>
        <Text style={[styles.ctaHint, { color: c.muted }]}>
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
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSpacer: { width: 40 },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  title: { fontSize: 18, fontFamily: fonts.playfair, textAlign: 'center' },
  subtitle: { fontSize: 12, fontFamily: fonts.dmMono, textAlign: 'center' },
  body: { flex: 1 },
  block: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  blockText: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 22 },
  nomineeSection: { paddingTop: SPACING.md, gap: 8 },
  sectionLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, paddingHorizontal: SPACING.md },
  sectionHint: { fontSize: 12, fontFamily: fonts.dmSans, fontStyle: 'italic', paddingHorizontal: SPACING.md },
  nomineeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  nomineeRowLast: { borderBottomWidth: 0 },
  nomineeInfo: { flex: 1, gap: 2 },
  nomineeName: { fontSize: 16, fontFamily: fonts.playfair },
  nomineeCount: { fontSize: 11, fontFamily: fonts.dmMono },
  nomineeCheckbox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  nomineeCheckmark: { fontSize: 12, color: '#fff' },
  footer: {
    padding: SPACING.md,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  cta: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  ctaText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700' },
  ctaHint: { fontSize: 11, fontFamily: fonts.dmSans, textAlign: 'center', lineHeight: 16 },
  amountRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  amountLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  amountValue: { fontSize: 32, fontFamily: fonts.playfair },
  centeredBody: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.lg, gap: SPACING.md,
  },
  successKanji: { fontSize: 64 },
  successTitle: { fontSize: 24, fontFamily: fonts.playfair, textAlign: 'center' },
  successSub: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 22, textAlign: 'center' },
  successBtn: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  successBtnText: { fontSize: 14, fontFamily: fonts.dmSans },
});
