import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';
import { QUANTITIES } from '../../data/seed';

export default function QuantityPanel() {
  const { goBack, showPanel, order, setOrder } = usePanel();
  const c = useColors();
  const [selected, setSelected] = useState<number>(order.quantity ?? 4);
  const [isGift, setIsGift] = useState(order.is_gift);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.progress}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={[styles.seg, { backgroundColor: i < 4 ? c.text : c.border }]} />
          ))}
        </View>
        <Text style={[styles.stepLabel, { color: c.muted }]}>STEP 4 OF 7</Text>
        <Text style={[styles.stepTitle, { color: c.text }]}>Quantity</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.grid}>
          {QUANTITIES.map(q => {
            const isSelected = selected === q;
            return (
              <TouchableOpacity
                key={q}
                style={[styles.qCard, { backgroundColor: c.optionCard, borderColor: c.optionCardBorder }, isSelected && { backgroundColor: c.accent, borderColor: 'transparent' }]}
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

        <View style={[styles.giftRow, { backgroundColor: c.optionCard, borderColor: c.optionCardBorder }]}>
          <Text style={[styles.giftLabel, { color: c.text }]}>This is a gift</Text>
          <Switch
            value={isGift}
            onValueChange={setIsGift}
            trackColor={{ true: c.accent }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: c.text }]}
          onPress={() => {
            setOrder({ quantity: selected, is_gift: isGift });
            showPanel('when');
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.continueBtnText, { color: c.ctaText }]}>Continue</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goBack} activeOpacity={0.6} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: c.accent }]}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: SPACING.md, paddingTop: 8, paddingBottom: 12 },
  progress: { flexDirection: 'row', gap: 3, marginBottom: 10 },
  seg: { flex: 1, height: 3, borderRadius: 1 },
  stepLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginBottom: 2 },
  stepTitle: { fontSize: 32, fontFamily: fonts.playfair },
  body: { flex: 1, paddingHorizontal: SPACING.md, gap: SPACING.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  qCard: {
    width: '47%',
    borderRadius: 14,
    padding: SPACING.md,
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  qNum: { fontSize: 32, fontFamily: fonts.playfair },
  qLabel: { fontSize: 12, fontFamily: fonts.dmSans },
  giftRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  giftLabel: { fontSize: 15, fontFamily: fonts.playfair },
  footer: { padding: SPACING.md, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  continueBtn: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  continueBtnText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700' },
  backLink: { alignItems: 'center', paddingVertical: 8 },
  backLinkText: { fontSize: 15, fontFamily: fonts.dmSans },
});
