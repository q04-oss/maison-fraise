import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

export default function ConfirmationPanel() {
  const { goHome, showPanel, order } = usePanel();
  const c = useColors();

  return (
    <View style={styles.container}>
      <View style={[styles.body]}>
        <View style={[styles.checkCircle, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.checkIcon, { color: c.accent }]}>✓</Text>
        </View>
        <Text style={[styles.title, { color: c.text }]}>Order placed.</Text>
        <Text style={[styles.subtitle, { color: c.muted }]}>{order.location_name} · {order.time_slot_time}</Text>

        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.cardRow}>
            <Text style={[styles.cardLabel, { color: c.muted }]}>ORDER</Text>
            <Text style={[styles.cardValue, { color: c.text }]}>#{order.order_id}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <View style={styles.cardRow}>
            <Text style={[styles.cardLabel, { color: c.muted }]}>TOTAL</Text>
            <Text style={[styles.cardValue, { color: c.text }]}>CA${((order.total_cents ?? 0) / 100).toFixed(2)}</Text>
          </View>
        </View>

        {order.nfc_token && (
          <View style={[styles.nfcCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.nfcTitle, { color: c.text }]}>Open your box when you arrive.</Text>
            <Text style={[styles.nfcBody, { color: c.muted }]}>Tap your phone to the NFC chip inside the lid to verify your membership.</Text>
            <TouchableOpacity
              style={[styles.nfcBtn, { backgroundColor: c.accent }]}
              onPress={() => showPanel('nfc')}
              activeOpacity={0.85}
            >
              <Text style={styles.nfcBtnText}>Verify now</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={[styles.standingBtn, { backgroundColor: c.card, borderColor: c.border }]}
          onPress={() => showPanel('standingOrder')}
          activeOpacity={0.8}
        >
          <Text style={[styles.standingBtnText, { color: c.accent }]}>Make this a standing order</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <TouchableOpacity
          style={[styles.doneBtn, { backgroundColor: c.text }]}
          onPress={() => { goHome(); TrueSheet.present('main-sheet', 1); }}
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
  body: { flex: 1, padding: SPACING.md, gap: SPACING.md, alignItems: 'center', paddingTop: 32 },
  checkCircle: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  checkIcon: { fontSize: 32 },
  title: { fontSize: 32, fontFamily: fonts.playfair },
  subtitle: { fontSize: 14, fontFamily: fonts.dmSans },
  card: { borderRadius: 14, width: '100%', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 12 },
  cardLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  cardValue: { fontSize: 15, fontFamily: fonts.playfair },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md },
  nfcCard: { borderRadius: 14, padding: SPACING.md, width: '100%', gap: 8, borderWidth: StyleSheet.hairlineWidth },
  nfcTitle: { fontSize: 15, fontFamily: fonts.playfair },
  nfcBody: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20 },
  nfcBtn: { borderRadius: 20, paddingVertical: 10, paddingHorizontal: 20, alignSelf: 'flex-start' },
  nfcBtnText: { color: '#fff', fontSize: 13, fontFamily: fonts.dmSans, fontWeight: '600' },
  standingBtn: { borderRadius: 14, padding: SPACING.md, width: '100%', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  standingBtnText: { fontSize: 14, fontFamily: fonts.playfair },
  footer: { padding: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth },
  doneBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  doneBtnText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700' },
});
