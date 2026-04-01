import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';
import { QUANTITIES } from '../../data/seed';

// Split quantities into rows of 2
const QTY_ROWS = QUANTITIES.reduce<number[][]>((acc, q, i) => {
  if (i % 2 === 0) acc.push([q]);
  else acc[acc.length - 1].push(q);
  return acc;
}, []);

export default function QuantityPanel() {
  const { goBack, showPanel, order, setOrder } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<number>(order.quantity ?? 4);
  const [isGift, setIsGift] = useState(order.is_gift);

  useEffect(() => { TrueSheet.present('main-sheet', 2); }, []);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Quantity</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <View style={styles.grid}>
          {QTY_ROWS.map((row, ri) => (
            <View key={ri} style={styles.gridRow}>
              {row.map(q => {
                const isSelected = selected === q;
                return (
                  <TouchableOpacity
                    key={q}
                    style={[
                      styles.qCard,
                      { backgroundColor: c.optionCard, borderColor: c.optionCardBorder },
                      isSelected && { backgroundColor: c.accent, borderColor: 'transparent' },
                    ]}
                    onPress={() => setSelected(q)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.qNum, { color: isSelected ? '#fff' : c.text }]}>{q}</Text>
                    <Text style={[styles.qLabel, { color: isSelected ? 'rgba(255,255,255,0.7)' : c.muted }]}>
                      {q === 1 ? 'strawberry' : 'strawberries'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.giftRow, { backgroundColor: c.card, borderColor: c.border }]}
          onPress={() => setIsGift(v => !v)}
          activeOpacity={0.8}
        >
          <View style={styles.giftLeft}>
            <Text style={[styles.giftLabel, { color: c.text }]}>This is a gift</Text>
            <Text style={[styles.giftSub, { color: c.muted }]}>We'll add a note card</Text>
          </View>
          <Switch
            value={isGift}
            onValueChange={setIsGift}
            trackColor={{ true: c.accent }}
            thumbColor="#FFFFFF"
          />
        </TouchableOpacity>
      </View>

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: c.accent }]}
          onPress={() => {
            setOrder({ quantity: selected, is_gift: isGift });
            showPanel(isGift ? 'gift-note' : 'when');
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaText}>Continue</Text>
        </TouchableOpacity>
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
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 22, lineHeight: 28 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  body: { flex: 1, paddingHorizontal: SPACING.md, gap: SPACING.sm },
  grid: { flex: 1, gap: SPACING.sm },
  gridRow: { flex: 1, flexDirection: 'row', gap: SPACING.sm },
  qCard: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  qNum: { fontSize: 40, fontFamily: fonts.playfair },
  qLabel: { fontSize: 13, fontFamily: fonts.dmSans },
  giftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: SPACING.md,
    paddingVertical: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  giftLeft: { flex: 1, gap: 2 },
  giftLabel: { fontSize: 16, fontFamily: fonts.playfair },
  giftSub: { fontSize: 12, fontFamily: fonts.dmSans },
  footer: { padding: SPACING.md, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  ctaText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700', color: '#FFFFFF' },
});
