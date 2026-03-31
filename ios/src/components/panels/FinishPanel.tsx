import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';
import { FINISHES } from '../../data/seed';

export default function FinishPanel() {
  const { goBack, showPanel, order, setOrder } = usePanel();
  const c = useColors();
  const [selected, setSelected] = useState<string | null>(order.finish);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.progress}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={[styles.seg, { backgroundColor: i < 3 ? c.text : c.border }]} />
          ))}
        </View>
        <Text style={[styles.stepLabel, { color: c.muted }]}>STEP 3 OF 7</Text>
        <Text style={[styles.stepTitle, { color: c.text }]}>Finish</Text>
        <Text style={[styles.stepSub, { color: c.muted }]}>{order.variety_name ?? '—'} · {order.chocolate_name ?? '—'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.options} showsVerticalScrollIndicator={false}>
        {FINISHES.map(fin => {
          const isSelected = selected === fin.id;
          return (
            <TouchableOpacity
              key={fin.id}
              style={[styles.optionCard, { backgroundColor: c.optionCard, borderColor: c.optionCardBorder }, isSelected && { backgroundColor: c.accent, borderColor: 'transparent' }]}
              onPress={() => setSelected(fin.id)}
              activeOpacity={0.85}
            >
              <Text style={[styles.optionName, { color: isSelected ? '#fff' : c.text }]}>{fin.name}</Text>
              <Text style={[styles.optionDesc, { color: isSelected ? 'rgba(255,255,255,0.7)' : c.muted }]}>{fin.description}</Text>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 8 }} />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: c.text }, !selected && styles.continueBtnDisabled]}
          onPress={() => {
            if (!selected) return;
            const fin = FINISHES.find(x => x.id === selected);
            setOrder({ finish: selected, finish_name: fin?.name ?? selected });
            showPanel('quantity');
          }}
          disabled={!selected}
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
  stepSub: { fontSize: 13, fontFamily: fonts.dmSans, marginTop: 2 },
  options: { paddingHorizontal: SPACING.md, gap: SPACING.sm },
  optionCard: { borderRadius: 14, padding: SPACING.md, gap: 4, borderWidth: StyleSheet.hairlineWidth },
  optionName: { fontSize: 16, fontFamily: fonts.playfair },
  optionDesc: { fontSize: 13, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  footer: { padding: SPACING.md, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  continueBtn: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  continueBtnDisabled: { opacity: 0.3 },
  continueBtnText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700' },
  backLink: { alignItems: 'center', paddingVertical: 8 },
  backLinkText: { fontSize: 15, fontFamily: fonts.dmSans },
});
