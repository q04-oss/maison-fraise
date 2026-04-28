import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel, FraiseEvent } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { claimEvent, getMemberToken } from '../../lib/api';
import { Card, MetaRow, ProgressBar, PrimaryButton } from '../ui';

const SHEET_NAME = 'main-sheet';

export default function EventDetailPanel() {
  const {
    goBack, showPanel, panelData, activeEvent,
    member, setMember, claims, setClaims, events, setEvents,
  } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const ev: FraiseEvent | null = panelData?.event ?? activeEvent;

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [claimed, setClaimed]   = useState(false);

  useEffect(() => {
    if (!ev) return;
    const alreadyClaimed = claims.some(cl => cl.event_id === ev.id);
    setClaimed(alreadyClaimed);
    setError(null);
  }, [ev?.id, claims]);

  if (!ev) {
    return (
      <View style={[styles.center, { backgroundColor: c.panelBg }]}>
        <Text style={[styles.muted, { color: c.muted }]}>no event selected.</Text>
      </View>
    );
  }

  const pct      = Math.min(100, Math.round((ev.seats_claimed / ev.min_seats) * 100));
  const seatsLeft = ev.max_seats - ev.seats_claimed;
  const isFull   = seatsLeft <= 0;
  const isReady  = ev.status !== 'open';

  const handleClaim = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getMemberToken();
      if (!token) {
        setLoading(false);
        showPanel('account');
        setTimeout(() => TrueSheet.resize(SHEET_NAME, 2), 350);
        return;
      }
      if (!member || member.credit_balance < 1) {
        setLoading(false);
        showPanel('credits');
        setTimeout(() => TrueSheet.resize(SHEET_NAME, 2), 350);
        return;
      }
    } catch { setLoading(false); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await claimEvent(ev.id);
      setMember(prev => prev ? { ...prev, credit_balance: result.credit_balance } : prev);
      setClaims(prev => [...prev, {
        id: Date.now(),
        status: 'claimed',
        created_at: new Date().toISOString(),
        event_id: ev.id,
        title: ev.title,
        description: ev.description,
        price_cents: ev.price_cents,
        min_seats: ev.min_seats,
        max_seats: ev.max_seats,
        seats_claimed: result.seats_claimed,
        event_status: ev.status,
        event_date: ev.event_date,
        business_name: ev.business_name,
        business_slug: ev.business_slug,
      }]);
      setEvents(prev => prev.map(e => e.id === ev.id
        ? { ...e, seats_claimed: result.seats_claimed }
        : e
      ));
      setClaimed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError(err.message || 'something went wrong.');
    }
    setLoading(false);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.panelBg }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Back */}
      <TouchableOpacity style={styles.back} onPress={goBack} activeOpacity={0.6}>
        <Text style={[styles.backText, { color: c.muted }]}>← back</Text>
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.biz, { color: c.muted }]}>{ev.business_name}</Text>
        <Text style={[styles.title, { color: c.text }]}>{ev.title}</Text>
      </View>

      {/* Description */}
      {ev.description ? (
        <Text style={[styles.desc, { color: c.muted }]}>{ev.description}</Text>
      ) : null}

      {/* Meta card */}
      <Card style={styles.metaCard}>
        <MetaRow label="price" value="1 credit (CA$120)" />
        <MetaRow label="spots claimed" value={String(ev.seats_claimed)} />
        <MetaRow label="minimum to go ahead" value={String(ev.min_seats)} />
        <MetaRow label="maximum spots" value={String(ev.max_seats)} />
        {ev.event_date ? <MetaRow label="date" value={ev.event_date} last /> : null}
        <View style={styles.progressWrap}>
          <ProgressBar
            pct={pct}
            ready={isReady}
            label={`${pct}% to threshold${isReady ? ' — going ahead' : ''}`}
          />
        </View>
      </Card>

      {/* Status notice */}
      {ev.status === 'confirmed' && ev.event_date ? (
        <View style={[styles.notice, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.noticeText, { color: c.text }]}>
            date confirmed: {ev.event_date}
          </Text>
        </View>
      ) : ev.status === 'threshold_met' ? (
        <View style={[styles.notice, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.noticeText, { color: '#27AE60' }]}>
            threshold met — date being set.
          </Text>
        </View>
      ) : null}

      {/* Error */}
      {error ? (
        <Text style={[styles.error, { color: '#C0392B' }]}>{error}</Text>
      ) : null}

      {/* CTA */}
      {claimed ? (
        <View style={[styles.doneCard, { borderColor: c.border }]}>
          <Text style={[styles.doneTitle, { color: c.text }]}>you're in.</Text>
          <Text style={[styles.doneSub, { color: c.muted }]}>
            we'll let you know when the date is set.
          </Text>
        </View>
      ) : isFull ? (
        <View style={[styles.ctaArea, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.ctaText, { color: c.muted }]}>SOLD OUT</Text>
        </View>
      ) : (
        <View style={styles.ctaArea}>
          <PrimaryButton
            label="claim a spot →"
            onPress={handleClaim}
            loading={loading}
          />
        </View>
      )}

      <Text style={[styles.note, { color: c.muted }]}>
        date tbd — you'll be notified when it's set. full credit refund if it doesn't work for you.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: SPACING.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  backText: { fontSize: 12, fontFamily: fonts.dmMono },
  header: { paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  biz: {
    fontSize: 10,
    fontFamily: fonts.dmMono,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: { fontSize: 18, fontFamily: fonts.dmMono, fontWeight: '500', lineHeight: 26 },
  desc: {
    fontSize: 13,
    fontFamily: fonts.dmMono,
    lineHeight: 20,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  metaCard: { marginHorizontal: SPACING.lg, marginBottom: SPACING.lg },
  progressWrap: { padding: SPACING.md },
  notice: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    padding: SPACING.sm,
  },
  noticeText: { fontSize: 12, fontFamily: fonts.dmMono },
  error: {
    fontSize: 12,
    fontFamily: fonts.dmMono,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  ctaArea: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  ctaText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', paddingVertical: 14 },
  doneCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    borderRadius: 12,
    borderWidth: 1,
    padding: SPACING.md,
    gap: 4,
  },
  doneTitle: { fontSize: 14, fontFamily: fonts.dmMono, fontWeight: '500' },
  doneSub: { fontSize: 12, fontFamily: fonts.dmMono, lineHeight: 18 },
  note: {
    fontSize: 11,
    fontFamily: fonts.dmMono,
    lineHeight: 17,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
  },
  muted: { fontSize: 13, fontFamily: fonts.dmMono },
});
