import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStripe } from '@stripe/stripe-react-native';
import { usePanel } from '../../context/PanelContext';
import {
  fetchMyMembership,
  createMembershipIntent,
  renewMembership,
  joinMembershipWaitlist,
} from '../../lib/api';
import { useColors, fonts, SPACING } from '../../theme';

const TIERS = [
  { id: 'maison',     label: 'Maison',     amount: 300000,        stripe: true },
  { id: 'reserve',    label: 'Réserve',    amount: 3000000,       stripe: true },
  { id: 'atelier',    label: 'Atelier',    amount: 30000000,      stripe: true },
  { id: 'fondateur',  label: 'Fondateur',  amount: 300000000,     stripe: false },
  { id: 'patrimoine', label: 'Patrimoine', amount: 3000000000,    stripe: false },
  { id: 'souverain',  label: 'Souverain',  amount: 30000000000,   stripe: false },
  { id: 'unnamed',    label: '—',          amount: 300000000000,  stripe: false },
];

function fmtCents(cents: number): string {
  return `CA$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(iso: string): number {
  const now = new Date();
  const then = new Date(iso);
  return Math.ceil((then.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function MembershipPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [membership, setMembership] = useState<any | null>(null);
  const [fundBalance, setFundBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);

  useEffect(() => {
    fetchMyMembership()
      .then(data => {
        setMembership(data.membership);
        setFundBalance(data.fund.balance_cents);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const runPaymentSheet = async (clientSecret: string): Promise<boolean> => {
    const email = await AsyncStorage.getItem('user_email');
    const { error: initErr } = await initPaymentSheet({
      merchantDisplayName: 'Maison Fraise',
      paymentIntentClientSecret: clientSecret,
      applePay: {
        merchantCountryCode: 'CA',
        merchantIdentifier: 'merchant.com.maisonfraise.app',
      },
      defaultBillingDetails: { email: email ?? undefined },
      appearance: {
        colors: {
          primary: c.accent,
          background: '#FFFFFF',
          componentBackground: '#F7F5F2',
          componentText: '#1C1C1E',
          componentBorder: '#E5E1DA',
          placeholderText: '#8E8E93',
        },
      },
    });
    if (initErr) throw new Error(initErr.message);
    const { error: presentErr } = await presentPaymentSheet();
    if (presentErr) {
      if (presentErr.code === 'Canceled') return false;
      throw new Error(presentErr.message);
    }
    return true;
  };

  const handleBuyTier = async (tier: typeof TIERS[number]) => {
    if (!tier.stripe) {
      Alert.alert('Contact us', 'Please reach out to arrange this membership tier.');
      return;
    }
    setPurchasing(true);
    try {
      const { client_secret } = await createMembershipIntent(tier.id);
      const paid = await runPaymentSheet(client_secret);
      if (paid) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setConfirmed(true);
      }
    } catch (err: unknown) {
      Alert.alert('Payment failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRenew = async () => {
    setRenewingId('renew');
    try {
      const result: any = await renewMembership();

      if (result.fully_covered) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setConfirmed(true);
        return;
      }

      if (result.client_secret) {
        const paid = await runPaymentSheet(result.client_secret);
        if (paid) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setConfirmed(true);
        }
      }
    } catch (err: unknown) {
      Alert.alert('Renewal failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setRenewingId(null);
    }
  };

  const renewalWithinThirtyDays = membership?.renews_at
    ? daysUntil(membership.renews_at) <= 30
    : false;

  // — Confirmed state —
  if (confirmed) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
            <Text style={[styles.back, { color: c.accent }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>MEMBERSHIP</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.confirmedBody}>
          <Text style={[styles.confirmedKanji, { color: c.accent, fontFamily: fonts.playfair }]}>會</Text>
          <Text style={[styles.confirmedLabel, { color: c.text, fontFamily: fonts.playfair }]}>
            Membership active.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>MEMBERSHIP</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : membership ? (
        // — Active membership view —
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Tier name */}
          <Text style={[styles.tierName, { color: c.text, fontFamily: fonts.playfair }]}>
            {TIERS.find(t => t.id === membership.tier)?.label ?? membership.tier}
          </Text>

          {/* Renewal date */}
          {membership.renews_at && (
            <Text style={[styles.renewsAt, { color: c.muted, fontFamily: fonts.dmMono }]}>
              Renews {fmtDate(membership.renews_at)}
            </Text>
          )}

          {/* Fund balance section */}
          <View style={[styles.fundCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.fundLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>
              FUND BALANCE
            </Text>
            <Text style={[styles.fundAmount, { color: c.text, fontFamily: fonts.playfair }]}>
              {fmtCents(fundBalance)}
            </Text>
            <Text style={[styles.fundSub, { color: c.muted, fontFamily: fonts.dmSans }]}>
              Available toward renewal
            </Text>
          </View>

          {/* Renewal CTA — only within 30 days */}
          {renewalWithinThirtyDays && (
            <View style={[styles.renewCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <RenewalCTA
                membershipAmountCents={membership.amount_cents}
                fundBalance={fundBalance}
                renewing={renewingId === 'renew'}
                onRenew={handleRenew}
                c={c}
              />
            </View>
          )}
        </ScrollView>
      ) : (
        // — No membership: tier selection —
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {TIERS.map(tier => (
            <TouchableOpacity
              key={tier.id}
              style={[styles.tierRow, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={() => handleBuyTier(tier)}
              disabled={purchasing}
              activeOpacity={0.8}
            >
              <Text style={[styles.tierRowLabel, { color: c.text, fontFamily: fonts.playfair }]}>
                {tier.label}
              </Text>
              <Text style={[styles.tierRowAmount, { color: tier.stripe ? c.accent : c.muted, fontFamily: fonts.dmMono }]}>
                {fmtCents(tier.amount)}/yr
              </Text>
            </TouchableOpacity>
          ))}

          <Text style={[styles.fundNote, { color: c.muted, fontFamily: fonts.dmSans }]}>
            Commissions earned through the platform accumulate in your fund and offset future membership renewals.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

// Extracted to avoid nested hook concerns — just a plain component
function RenewalCTA({
  membershipAmountCents,
  fundBalance,
  renewing,
  onRenew,
  c,
}: {
  membershipAmountCents: number;
  fundBalance: number;
  renewing: boolean;
  onRenew: () => void;
  c: ReturnType<typeof useColors>;
}) {
  const fullyCovered = fundBalance >= membershipAmountCents;
  const creditApplied = Math.min(fundBalance, membershipAmountCents);
  const amountDue = Math.max(0, membershipAmountCents - creditApplied);

  let label: string;
  if (fullyCovered) {
    label = "You've earned enough — renew at no cost";
  } else if (creditApplied > 0) {
    label = `Renew · ${fmtCents(amountDue)} (${fmtCents(creditApplied)} credit applied)`;
  } else {
    label = `Renew · ${fmtCents(membershipAmountCents)}`;
  }

  return (
    <TouchableOpacity
      style={[styles.renewBtn, { backgroundColor: c.accent }, renewing && { opacity: 0.6 }]}
      onPress={onRenew}
      disabled={renewing}
      activeOpacity={0.8}
    >
      {renewing ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[styles.renewBtnText, { fontFamily: fonts.dmMono }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { fontSize: 28 },
  title: { fontSize: 14, letterSpacing: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {
    padding: SPACING.md,
    paddingBottom: 60,
    gap: SPACING.md,
  },
  // Active membership
  tierName: { fontSize: 32, textAlign: 'center', marginTop: SPACING.md },
  renewsAt: { fontSize: 12, letterSpacing: 0.5, textAlign: 'center', marginTop: 4 },
  fundCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md,
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.sm,
  },
  fundLabel: { fontSize: 11, letterSpacing: 1.5 },
  fundAmount: { fontSize: 28 },
  fundSub: { fontSize: 12, marginTop: 2 },
  renewCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  renewBtn: {
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
  },
  renewBtnText: { color: '#fff', fontSize: 13, letterSpacing: 1 },
  // Tier selection
  tierRow: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tierRowLabel: { fontSize: 20 },
  tierRowAmount: { fontSize: 12, letterSpacing: 0.5 },
  fundNote: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: SPACING.sm,
    marginTop: SPACING.sm,
  },
  // Confirmed
  confirmedBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  confirmedKanji: { fontSize: 72, lineHeight: 80 },
  confirmedLabel: { fontSize: 22, textAlign: 'center' },
});
