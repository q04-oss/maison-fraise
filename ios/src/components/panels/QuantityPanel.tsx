import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';
import { QUANTITIES } from '../../data/seed';

export default function QuantityPanel() {
  const { goBack, showPanel, order, setOrder } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<number>(order.quantity);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Boxes</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.sectionLabel, { color: c.muted }]}>BOXES</Text>
        <View style={[styles.card, { backgroundColor: c.card }]}>
          {QUANTITIES.map((q, i) => {
            const isSelected = selected === q;
            return (
              <React.Fragment key={q}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: c.border }]} />}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => setSelected(q)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.qNum, { color: c.text }]}>{q}</Text>
                  <Text style={[styles.qLabel, { color: c.muted }]}>{q === 1 ? 'box' : 'boxes'}</Text>
                  <View style={[styles.radio, { borderColor: isSelected ? c.accent : c.border }]}>
                    {isSelected && <View style={[styles.radioDot, { backgroundColor: c.accent }]} />}
                  </View>
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: c.accent }]}
          onPress={() => {
            setOrder({ quantity: selected, is_gift: false, gift_note: null });
            showPanel('review');
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
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  body: { flex: 1, paddingHorizontal: SPACING.md, paddingTop: SPACING.md, gap: 8, justifyContent: 'center' },
  sectionLabel: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1, marginLeft: 4 },
  card: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 14, gap: 12 },
  qNum: { fontSize: 22, fontFamily: fonts.playfair, width: 36 },
  qLabel: { flex: 1, fontSize: 14, fontFamily: fonts.dmSans },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md },
  footer: { padding: SPACING.md, paddingTop: 12 },
  cta: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  ctaText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700', color: '#FFFFFF' },
});
