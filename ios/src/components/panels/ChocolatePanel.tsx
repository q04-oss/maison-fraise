import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';
import { CHOCOLATES } from '../../data/seed';

export default function ChocolatePanel() {
  const { goBack, showPanel, order, setOrder } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(order.chocolate);

  useEffect(() => { TrueSheet.present('main-sheet', 2); }, []);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Chocolate</Text>
        <View style={styles.headerSpacer} />
      </View>
      <Text style={[styles.subtitle, { color: c.muted }]}>{order.variety_name ?? '—'}</Text>

      <View style={styles.options}>
        {CHOCOLATES.map(choc => {
          const isSelected = selected === choc.id;
          return (
            <TouchableOpacity
              key={choc.id}
              style={[
                styles.card,
                { backgroundColor: c.optionCard, borderColor: c.optionCardBorder },
                isSelected && { backgroundColor: c.accent, borderColor: 'transparent' },
              ]}
              onPress={() => setSelected(choc.id)}
              activeOpacity={0.85}
            >
              <View style={styles.cardTop}>
                <View style={[styles.swatch, { backgroundColor: choc.swatchColor }]} />
                <View style={styles.cardTitles}>
                  <Text style={[styles.cardName, { color: isSelected ? '#fff' : c.text }]}>{choc.name}</Text>
                  <Text style={[styles.cardSource, { color: isSelected ? 'rgba(255,255,255,0.65)' : c.muted }]}>{choc.source}</Text>
                </View>
                {choc.tag && (
                  <View style={[styles.tag, { backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : c.cardDark }]}>
                    <Text style={[styles.tagText, { color: isSelected ? '#fff' : c.muted }]}>{choc.tag}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.cardDesc, { color: isSelected ? 'rgba(255,255,255,0.8)' : c.muted }]}>{choc.description}</Text>
              <Text style={[styles.cardTagline, { color: isSelected ? 'rgba(255,255,255,0.55)' : c.muted }]}>{choc.tagline}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: c.accent }, !selected && styles.ctaDisabled]}
          onPress={() => {
            if (!selected) return;
            const choc = CHOCOLATES.find(x => x.id === selected);
            setOrder({ chocolate: selected, chocolate_name: choc?.name ?? selected });
            showPanel('finish');
          }}
          disabled={!selected}
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
  subtitle: { textAlign: 'center', fontSize: 13, fontFamily: fonts.dmSans, paddingTop: 10, paddingBottom: 4, paddingHorizontal: SPACING.md },
  options: { flex: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 10 },
  card: {
    flex: 1,
    borderRadius: 16,
    padding: SPACING.md,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  swatch: { width: 22, height: 22, borderRadius: 11, flexShrink: 0 },
  cardTitles: { flex: 1, gap: 2 },
  cardName: { fontSize: 17, fontFamily: fonts.playfair },
  cardSource: { fontSize: 12, fontFamily: fonts.dmSans },
  tag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1 },
  cardDesc: { fontSize: 14, fontFamily: fonts.dmSans },
  cardTagline: { fontSize: 12, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  footer: { padding: SPACING.md, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  ctaDisabled: { opacity: 0.3 },
  ctaText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700', color: '#FFFFFF' },
});
