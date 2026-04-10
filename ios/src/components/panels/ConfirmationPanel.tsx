import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';
import * as Location from 'expo-location';
import { registerGeofences } from '../../lib/geofence';

export default function ConfirmationPanel() {
  const { goHome, showPanel, jumpToPanel, order, businesses } = usePanel();
  const c = useColors();
  const [isVerified, setIsVerified] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    AsyncStorage.getItem('verified').then(v => setIsVerified(v === 'true'));
    if (businesses.length > 0) {
      // Only request background permission if not already granted
      Location.getBackgroundPermissionsAsync().then(({ status }) => {
        if (status === 'granted') {
          registerGeofences(businesses);
        } else {
          Location.requestBackgroundPermissionsAsync()
            .then(() => registerGeofences(businesses))
            .catch(() => {});
        }
      }).catch(() => {});
    }
  }, []);

  const handleShareOrder = () => {
    if (!order.order_id) return;
    Share.share({ message: `Box Fraise — Order #${order.order_id}` });
  };

  const isQueued = order.order_status === 'queued';

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.body]}>
        <View style={[styles.checkCircle, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.checkIcon, { color: c.accent }]}>{isQueued ? '◷' : '✓'}</Text>
        </View>
        <Text style={[styles.title, { color: c.text }]}>{isQueued ? 'You\'re in the queue.' : 'Order placed.'}</Text>
        <Text style={[styles.subtitle, { color: c.muted }]}>
          {isQueued
            ? 'We\'ll notify you when your batch is confirmed. Your card won\'t be charged until then.'
            : order.location_name}
        </Text>

        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.cardRow}>
            <Text style={[styles.cardLabel, { color: c.muted }]}>ORDER</Text>
            <TouchableOpacity onLongPress={handleShareOrder} activeOpacity={0.7}>
              <Text style={[styles.cardValue, { color: c.text }]}>#{order.order_id}</Text>
              <Text style={[styles.shareHint, { color: c.muted }]}>Hold to share</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <View style={styles.cardRow}>
            <Text style={[styles.cardLabel, { color: c.muted }]}>{isQueued ? 'AMOUNT HELD' : 'TOTAL'}</Text>
            <Text style={[styles.cardValue, { color: c.text }]}>CA${((order.total_cents ?? 0) / 100).toFixed(2)}</Text>
          </View>
          {isQueued && (
            <>
              <View style={[styles.divider, { backgroundColor: c.border }]} />
              <View style={styles.cardRow}>
                <Text style={[styles.cardLabel, { color: c.muted }]}>PICKUP</Text>
                <Text style={[styles.cardValue, { color: c.muted }]}>within 3 days of batch fill</Text>
              </View>
            </>
          )}
          {!isQueued && order.delivery_date && (
            <>
              <View style={[styles.divider, { backgroundColor: c.border }]} />
              <View style={styles.cardRow}>
                <Text style={[styles.cardLabel, { color: c.muted }]}>READY</Text>
                <Text style={[styles.cardValue, { color: c.text }]}>{order.delivery_date}</Text>
              </View>
            </>
          )}
        </View>

        {!isQueued && isVerified && (
          <TouchableOpacity
            style={[styles.standingBtn, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={() => showPanel('batch-preference')}
            activeOpacity={0.8}
          >
            <Text style={[styles.standingBtnText, { color: c.accent }]}>Set up batch preferences</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: c.text }]}
          onPress={goHome}
          activeOpacity={0.8}
        >
          <Text style={[styles.doneBtnText, { color: c.ctaText }]}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, padding: SPACING.md, gap: SPACING.md, alignItems: 'center', justifyContent: 'center' },
  checkCircle: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  checkIcon: { fontSize: 32 },
  title: { fontSize: 32, fontFamily: fonts.playfair },
  subtitle: { fontSize: 14, fontFamily: fonts.dmSans },
  card: { borderRadius: 14, width: '100%', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: SPACING.md, paddingVertical: 12 },
  cardLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  cardValue: { fontSize: 15, fontFamily: fonts.playfair, textAlign: 'right' },
  shareHint: { fontSize: 10, fontFamily: fonts.dmSans, textAlign: 'right', marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md },
  nfcCard: { borderRadius: 14, padding: SPACING.md, width: '100%', gap: 8, borderWidth: StyleSheet.hairlineWidth },
  nfcTitle: { fontSize: 15, fontFamily: fonts.playfair },
  nfcBody: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20 },
  nfcBtn: { borderRadius: 20, paddingVertical: 10, paddingHorizontal: 20, alignSelf: 'flex-start' },
  nfcBtnText: { color: '#fff', fontSize: 13, fontFamily: fonts.dmSans, fontWeight: '600' },
  standingBtn: { borderRadius: 14, padding: SPACING.md, width: '100%', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  standingBtnText: { fontSize: 14, fontFamily: fonts.playfair },
  footer: { padding: SPACING.md },
  doneBtn: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  doneBtnText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700' },
});
