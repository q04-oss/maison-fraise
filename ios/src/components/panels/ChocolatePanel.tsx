import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { CHOCOLATES } from '../../data/seed';

export default function ChocolatePanel() {
  const { goBack, showPanel, order, setOrder } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(order.chocolate);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>

      {/* Collapsed strip label */}
      <View style={styles.strip}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.stripLabel, { color: c.muted }]}>chocolate</Text>
      </View>

      <View style={styles.body}>
        {CHOCOLATES.map((choc, i) => {
          const isSelected = selected === choc.id;
          return (
            <React.Fragment key={choc.id}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: c.border }]} />}
              <TouchableOpacity
                style={styles.row}
                onPress={() => setSelected(choc.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.swatch, { backgroundColor: choc.swatchColor }]} />
                <View style={styles.rowText}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.chocName, { color: c.text }]}>{choc.name}</Text>
                    {choc.tag && (
                      <Text style={[styles.tag, { color: c.muted }]}>{choc.tag}</Text>
                    )}
                  </View>
                  <Text style={[styles.chocSource, { color: c.muted }]}>{choc.source}</Text>
                  {isSelected && (
                    <Text style={[styles.chocDesc, { color: c.muted }]}>{choc.description} {choc.tagline}</Text>
                  )}
                </View>
                {isSelected && <View style={[styles.dot, { backgroundColor: c.accent }]} />}
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom || SPACING.md }]}>
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
          <Text style={[styles.ctaText, { color: c.ctaText }]}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 20, paddingHorizontal: SPACING.md, paddingBottom: 8 },
  backArrow: { fontSize: 22, lineHeight: 28 },
  stripLabel: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  body: { flex: 1, paddingHorizontal: SPACING.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 12 },
  swatch: { width: 8, height: 8, borderRadius: 4, flexShrink: 0, marginTop: 2 },
  rowText: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chocName: { fontSize: 15, fontFamily: fonts.playfair },
  chocSource: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  tag: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1 },
  chocDesc: { fontSize: 12, fontFamily: fonts.dmSans, lineHeight: 18, marginTop: 2, fontStyle: 'italic' },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  divider: { height: StyleSheet.hairlineWidth },
  footer: { paddingHorizontal: SPACING.md, paddingTop: 12 },
  cta: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  ctaDisabled: { opacity: 0.3 },
  ctaText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700' },
});
