import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';
import { useStripe } from '@stripe/stripe-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { fetchPopupRsvpStatus, createPopupRsvp, checkInPopup } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatPopupDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function formatPopupTime(iso?: string, hours?: string): string {
  if (hours) return hours;
  if (!iso) return '';
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}${m > 0 ? `:${String(m).padStart(2, '0')}` : ''} ${ampm}`;
}

export default function PopupDetailPanel() {
  const { goBack, activeLocation } = usePanel();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [userDbId, setUserDbId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasRsvp, setHasRsvp] = useState(false);
  const [rsvping, setRsvping] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  const biz = activeLocation;

  const isLive = (): boolean => {
    if (!biz?.launched_at) return false;
    const start = new Date(biz.launched_at);
    const end = biz.ends_at
      ? new Date(biz.ends_at)
      : new Date(start.getTime() + 4 * 60 * 60 * 1000);
    const now = new Date();
    return now >= start && now < end;
  };

  const live = isLive();
  const spotsLeft = (biz?.capacity ?? 0) > 0 && (biz?.rsvp_count ?? 0) >= 0
    ? (biz!.capacity! - (biz?.rsvp_count ?? 0))
    : null;

  useEffect(() => {
    if (!biz) { setLoading(false); return; }
    AsyncStorage.getItem('user_db_id').then(async stored => {
      if (!stored) { setLoading(false); return; }
      const uid = parseInt(stored, 10);
      setUserDbId(uid);
      try {
        const status = await fetchPopupRsvpStatus(biz.id, uid);
        setHasRsvp(status.has_rsvp);
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    });
  }, [biz?.id]);

  const handleRsvp = async () => {
    if (!biz || !userDbId) return;
    setRsvping(true);
    try {
      const { client_secret } = await createPopupRsvp(biz.id, userDbId);
      const feeCents = biz.entrance_fee_cents ?? 0;
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Maison Fraise',
        paymentIntentClientSecret: client_secret,
        defaultBillingDetails: {},
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
      setHasRsvp(true);
    } catch (err: any) {
      Alert.alert('Could not complete RSVP', err.message ?? 'Try again.');
    } finally {
      setRsvping(false);
    }
  };

  const handleCheckIn = async () => {
    if (!biz || !userDbId || checkingIn) return;
    setCheckingIn(true);
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      const record = tag?.ndefMessage?.[0];
      if (!record?.payload) throw new Error('No data on chip.');
      const token = Ndef.text.decodePayload(new Uint8Array(record.payload as number[]));
      await checkInPopup(biz.id, userDbId, token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Welcome.', 'You\'re checked in. Enjoy the night.');
    } catch (err: any) {
      if (err?.message !== 'UserCancel') {
        Alert.alert('Check-in failed', 'Hold your phone to the NFC chip at the entrance and try again.');
      }
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
      setCheckingIn(false);
    }
  };

  const handleInstagram = (handle: string) => {
    Linking.openURL(`https://instagram.com/${handle.replace('@', '')}`);
  };

  if (!biz) return null;

  const dateStr = formatPopupDate(biz.launched_at);
  const timeStr = formatPopupTime(biz.launched_at, biz.hours ?? undefined);
  const hasPartner = !!(biz.description || biz.neighbourhood || biz.instagram_handle);

  const renderCta = () => {
    if (loading) return <ActivityIndicator color={c.accent} />;
    if (live && hasRsvp) {
      return (
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: c.accent }]}
          onPress={handleCheckIn}
          disabled={checkingIn}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaText}>
            {checkingIn ? 'Reading chip…' : 'Check in — tap the entrance'}
          </Text>
        </TouchableOpacity>
      );
    }
    if (live && !hasRsvp) {
      return (
        <View style={[styles.cta, { backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }]}>
          <Text style={[styles.ctaText, { color: c.muted }]}>RSVPs closed</Text>
        </View>
      );
    }
    if (!live && hasRsvp) {
      return (
        <View style={[styles.cta, { backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }]}>
          <Text style={[styles.ctaText, { color: c.accent }]}>You're going ✓</Text>
        </View>
      );
    }
    // Default: RSVP
    const feeLabel = biz.entrance_fee_cents
      ? `CA$${(biz.entrance_fee_cents / 100).toFixed(2)}`
      : 'Free';
    return (
      <TouchableOpacity
        style={[styles.cta, { backgroundColor: c.accent }]}
        onPress={handleRsvp}
        disabled={rsvping}
        activeOpacity={0.8}
      >
        {rsvping
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.ctaText}>RSVP · {feeLabel}</Text>
        }
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{biz.name}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Date, time, DJ */}
        <View style={[styles.infoBlock, { borderBottomColor: c.border }]}>
          {live && (
            <View style={[styles.liveBadge, { backgroundColor: '#C0392B' }]}>
              <Text style={styles.liveBadgeText}>LIVE NOW</Text>
            </View>
          )}
          <Text style={[styles.dateText, { color: c.text }]}>{dateStr}</Text>
          {timeStr !== '' && (
            <Text style={[styles.timeText, { color: c.muted }]}>{timeStr}</Text>
          )}
          <Text style={[styles.addressText, { color: c.muted }]}>{biz.address}</Text>
          <View style={[styles.djRow, { borderTopColor: c.border }]}>
            <Text style={[styles.djLabel, { color: c.muted }]}>DJ</Text>
            <Text style={[styles.djName, { color: c.text }]}>{biz.dj_name ?? 'TBA'}</Text>
          </View>
        </View>

        {/* Organizer note */}
        {!!biz.organizer_note && (
          <View style={[styles.noteBlock, { borderBottomColor: c.border }]}>
            <Text style={[styles.noteText, { color: c.muted }]}>"{biz.organizer_note}"</Text>
          </View>
        )}

        {/* Headcount */}
        <View style={[styles.headcountBlock, { borderBottomColor: c.border }]}>
          <Text style={[styles.headcountMain, { color: c.text }]}>
            {biz.rsvp_count ?? 0} going
          </Text>
          {spotsLeft !== null && (
            <Text style={[styles.headcountSub, { color: spotsLeft <= 5 ? '#C0392B' : c.muted }]}>
              {spotsLeft <= 0 ? 'Full' : `${spotsLeft} spots left`}
            </Text>
          )}
        </View>

        {/* Partner section */}
        {hasPartner && (
          <View style={[styles.partnerBlock, { borderBottomColor: c.border }]}>
            <Text style={[styles.partnerLabel, { color: c.muted }]}>IN COLLABORATION WITH</Text>
            <Text style={[styles.partnerName, { color: c.text }]}>{biz.name}</Text>
            {!!biz.description && (
              <Text style={[styles.partnerDesc, { color: c.muted }]}>{biz.description}</Text>
            )}
            <View style={styles.partnerMeta}>
              {!!biz.neighbourhood && (
                <Text style={[styles.partnerMetaText, { color: c.muted }]}>{biz.neighbourhood}</Text>
              )}
              {!!biz.instagram_handle && (
                <TouchableOpacity onPress={() => handleInstagram(biz.instagram_handle!)} activeOpacity={0.7}>
                  <Text style={[styles.partnerMetaText, { color: c.accent }]}>@{biz.instagram_handle.replace('@', '')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
        {renderCta()}
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
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  body: { flex: 1 },

  infoBlock: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  liveBadge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  liveBadgeText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, color: '#fff' },
  dateText: { fontSize: 22, fontFamily: fonts.playfair },
  timeText: { fontSize: 13, fontFamily: fonts.dmMono, marginTop: 2 },
  addressText: { fontSize: 13, fontFamily: fonts.dmSans, marginTop: 2 },
  djRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  djLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, width: 20 },
  djName: { fontSize: 15, fontFamily: fonts.playfair },

  noteBlock: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  noteText: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 22, fontStyle: 'italic' },

  headcountBlock: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  headcountMain: { fontSize: 17, fontFamily: fonts.playfair },
  headcountSub: { fontSize: 12, fontFamily: fonts.dmMono },

  partnerBlock: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  partnerLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  partnerName: { fontSize: 18, fontFamily: fonts.playfair },
  partnerDesc: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20 },
  partnerMeta: { flexDirection: 'row', gap: 14, marginTop: 4 },
  partnerMetaText: { fontSize: 12, fontFamily: fonts.dmMono },

  footer: {
    padding: SPACING.md,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cta: {
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700', color: '#fff' },
});
