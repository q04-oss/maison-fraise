import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStripe } from '@stripe/stripe-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { fetchCollectif, commitToCollectif, withdrawCollectif } from '../../lib/api';
import type { Business } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';

function fmtCAD(cents: number) {
  return `CA$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

const STATUS_LABEL: Record<string, string> = {
  open: 'open',
  funded: 'funded — awaiting response',
  expired: 'expired',
  cancelled: 'declined',
};

export default function CollectifDetailPanel() {
  const { goBack, panelData, businesses, setActiveLocation, showPanel } = usePanel();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const collectifId: number | null = panelData?.collectifId ?? null;

  const [collectif, setCollectif] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    if (!collectifId) { setLoading(false); return; }
    Promise.all([
      AsyncStorage.getItem('verified'),
      AsyncStorage.getItem('user_db_id'),
    ]).then(([v, id]) => {
      setIsVerified(v === 'true');
      setUserId(id ? parseInt(id, 10) : null);
    });
    fetchCollectif(collectifId)
      .then(setCollectif)
      .catch(() => Alert.alert('Error', 'Could not load collectif.'))
      .finally(() => setLoading(false));
  }, [collectifId]);

  const handleCommit = async () => {
    if (!collectif || committing) return;
    setCommitting(true);
    try {
      const { client_secret, amount_cents } = await commitToCollectif(collectifId, 1);
      const { error: initErr } = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: 'Maison Fraise',
      });
      if (initErr) throw new Error(initErr.message);
      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) {
        if (presentErr.code !== 'Canceled') Alert.alert('Payment failed', 'Please try again.');
        return;
      }
      Alert.alert(
        'Committed.',
        `CA$${(amount_cents / 100).toFixed(2)} held. You'll be notified when the business responds.`,
        [{ text: 'OK', onPress: () => fetchCollectif(collectifId).then(setCollectif) }],
      );
    } catch (e: any) {
      Alert.alert('Could not commit', e.message ?? 'Please try again.');
    } finally {
      setCommitting(false);
    }
  };

  const handleShare = () => {
    if (!collectif) return;
    Share.share({
      title: collectif.title,
      message: `${collectif.title} — ${collectif.business_name} · ${collectif.proposed_discount_pct}% off\nhttps://fraise.chat/collectif/${collectifId}`,
      url: `https://fraise.chat/collectif/${collectifId}`,
    });
  };

  const handleWithdraw = () => {
    Alert.alert(
      'Withdraw commitment?',
      'Your payment will be refunded in full.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw', style: 'destructive', onPress: async () => {
            setWithdrawing(true);
            try {
              await withdrawCollectif(collectifId);
              await fetchCollectif(collectifId).then(setCollectif);
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Please try again.');
            } finally {
              setWithdrawing(false);
            }
          },
        },
      ],
    );
  };

  if (loading || !collectif) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  const progress = collectif.target_quantity > 0
    ? Math.min(1, collectif.current_quantity / collectif.target_quantity)
    : 0;
  const isOpen = collectif.status === 'open';
  const isPopupType = collectif.collectif_type === 'popup';

  // Cross-surface: find an upcoming popup from this business in the context
  const now = new Date();
  const relatedPopup = (businesses as Business[]).find(b => {
    if (b.type !== 'popup') return false;
    if (!b.launched_at) return false;
    const d = new Date(b.launched_at);
    d.setHours(23, 59, 59, 999);
    if (d < now) return false;
    return b.name.toLowerCase().includes(collectif.business_name.toLowerCase()) ||
      collectif.business_name.toLowerCase().includes(b.name.toLowerCase());
  });

  const handleViewPopup = () => {
    if (!relatedPopup) return;
    setActiveLocation(relatedPopup);
    showPanel('popup-detail');
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>{collectif.business_name}</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn} activeOpacity={0.7}>
          <Text style={[styles.shareIcon, { color: c.accent }]}>↑</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: SPACING.md }} showsVerticalScrollIndicator={false}>
        {/* Status */}
        <Text style={[styles.statusLabel, { color: isOpen ? c.accent : c.muted }]}>
          {STATUS_LABEL[collectif.status] ?? collectif.status}
        </Text>
        {collectif.business_response === 'accepted' && (
          <Text style={[styles.acceptedNote, { color: '#4caf50' }]}>Business accepted — fulfillment in progress.</Text>
        )}

        <Text style={[styles.title, { color: c.text }]}>{collectif.title}</Text>
        {collectif.description && (
          <Text style={[styles.description, { color: c.muted }]}>{collectif.description}</Text>
        )}

        {/* Key numbers */}
        <View style={[styles.statsRow, { borderColor: c.border }]}>
          {(isPopupType ? [
            { label: 'VENUE', value: collectif.proposed_venue ?? '—' },
            { label: 'DATE', value: collectif.proposed_date ?? '—' },
            { label: 'DEPOSIT', value: fmtCAD(collectif.price_cents) },
          ] : [
            { label: 'DISCOUNT', value: `${collectif.proposed_discount_pct}%` },
            { label: 'PRICE/UNIT', value: fmtCAD(collectif.price_cents) },
            { label: 'DEADLINE', value: fmtDate(collectif.deadline) },
          ]).map(s => (
            <View key={s.label} style={styles.stat}>
              <Text style={[styles.statLabel, { color: c.muted }]}>{s.label}</Text>
              <Text style={[styles.statValue, { color: c.text }]} numberOfLines={1}>{s.value}</Text>
            </View>
          ))}
        </View>

        {/* Progress */}
        <View style={styles.progressSection}>
          <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` as any, backgroundColor: isOpen ? c.accent : '#4caf50' }]} />
          </View>
          <Text style={[styles.progressLabel, { color: c.muted }]}>
            {collectif.current_quantity} of {collectif.target_quantity} committed
          </Text>
        </View>

        {/* Attribution */}
        <Text style={[styles.creator, { color: c.muted }]}>
          Proposed by {collectif.creator_display_name ?? 'a member'}
        </Text>

        {/* Cross-surface: related popup event */}
        {relatedPopup && (
          <TouchableOpacity
            style={[styles.crossSurface, { borderColor: c.border }]}
            onPress={handleViewPopup}
            activeOpacity={0.75}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.crossSurfaceLabel, { color: c.muted }]}>UPCOMING EVENT</Text>
              <Text style={[styles.crossSurfaceName, { color: c.text }]}>{relatedPopup.name}</Text>
            </View>
            <Text style={[styles.crossSurfaceArrow, { color: c.accent }]}>→</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Footer CTA */}
      {isOpen && isVerified && (
        <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[styles.commitBtn, { backgroundColor: c.text }, committing && { opacity: 0.6 }]}
            onPress={handleCommit}
            disabled={committing}
            activeOpacity={0.8}
          >
            <Text style={[styles.commitBtnText, { color: c.ctaText }]}>
              {committing ? 'Processing…' : isPopupType
                ? `Commit deposit · ${fmtCAD(collectif.price_cents)}`
                : `Commit · ${fmtCAD(collectif.price_cents)}`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleWithdraw} disabled={withdrawing} activeOpacity={0.7}>
            <Text style={[styles.withdrawLink, { color: c.muted }]}>
              {withdrawing ? 'Withdrawing…' : 'Withdraw my commitment'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {!isVerified && isOpen && (
        <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom + 16 }]}>
          <Text style={[styles.gateNote, { color: c.muted }]}>Verified members can commit to collectifs.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  shareBtn: { width: 40, alignItems: 'flex-end', paddingVertical: 4 },
  shareIcon: { fontSize: 22, lineHeight: 34 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: fonts.dmMono, letterSpacing: 1 },
  statusLabel: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  acceptedNote: { fontFamily: fonts.dmMono, fontSize: 11, marginBottom: 10 },
  title: { fontFamily: fonts.playfair, fontSize: 22, marginBottom: 10, lineHeight: 30 },
  description: { fontFamily: fonts.dmSans, fontSize: 14, lineHeight: 22, marginBottom: 20 },
  statsRow: {
    flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: 14,
    marginBottom: 20,
  },
  stat: { flex: 1, padding: 14, alignItems: 'center', gap: 4 },
  statLabel: { fontFamily: fonts.dmMono, fontSize: 8, letterSpacing: 1.5 },
  statValue: { fontFamily: fonts.dmMono, fontSize: 14 },
  progressSection: { gap: 8, marginBottom: 20 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabel: { fontFamily: fonts.dmMono, fontSize: 11 },
  creator: { fontFamily: fonts.dmSans, fontSize: 12, fontStyle: 'italic' },
  footer: {
    padding: SPACING.md, paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth, gap: 12, alignItems: 'center',
  },
  commitBtn: {
    width: '100%', paddingVertical: 20, borderRadius: 16, alignItems: 'center',
  },
  commitBtnText: { fontFamily: fonts.dmSans, fontSize: 16, fontWeight: '700' },
  withdrawLink: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 0.5 },
  gateNote: { fontFamily: fonts.dmSans, fontSize: 13, fontStyle: 'italic', textAlign: 'center' },
  crossSurface: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 14,
    padding: 14, marginTop: 20, gap: 10,
  },
  crossSurfaceLabel: { fontFamily: fonts.dmMono, fontSize: 8, letterSpacing: 1.5, marginBottom: 3 },
  crossSurfaceName: { fontFamily: fonts.playfair, fontSize: 14 },
  crossSurfaceArrow: { fontSize: 18 },
});
