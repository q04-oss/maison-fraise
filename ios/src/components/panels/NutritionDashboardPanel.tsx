import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchVarietyPassport } from '../../lib/api';

// Typical nutritional values per 100g for strawberries
const STRAWBERRY_NUTRITION_PER_100G = {
  calories: 32,
  carbs_g: 7.7,
  sugars_g: 4.9,
  fiber_g: 2.0,
  protein_g: 0.7,
  fat_g: 0.3,
  vitamin_c_mg: 58.8,
  folate_mcg: 24,
  potassium_mg: 153,
};

const AVG_BOX_G = 500; // 500g per box

export default function NutritionDashboardPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [passport, setPassport] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVarietyPassport()
      .then(setPassport)
      .catch(() => setPassport([]))
      .finally(() => setLoading(false));
  }, []);

  const totalBoxes = passport.reduce((sum, p) => sum + (p.order_count ?? 0), 0);
  const totalG = totalBoxes * AVG_BOX_G;
  const multiplier = totalG / 100;

  const nutrients = Object.entries(STRAWBERRY_NUTRITION_PER_100G).map(([key, val]) => ({
    key,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    value: (val * multiplier).toFixed(1),
    unit: key.endsWith('_mg') ? 'mg' : key.endsWith('_mcg') ? 'mcg' : key.endsWith('_g') ? 'g' : 'kcal',
  }));

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>NUTRITION</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading && (
        <View style={styles.center}><ActivityIndicator color={c.accent} /></View>
      )}

      {!loading && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.summary}>
            <Text style={[styles.bigNum, { color: c.accent, fontFamily: fonts.playfair }]}>{totalBoxes}</Text>
            <Text style={[styles.bigLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>BOXES COLLECTED</Text>
            <Text style={[styles.sub, { color: c.muted, fontFamily: fonts.dmSans }]}>
              Lifetime totals based on ~{AVG_BOX_G}g per box
            </Text>
          </View>

          {totalBoxes === 0 ? (
            <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>
              Collect your first order to see your nutrition totals.
            </Text>
          ) : (
            <View style={styles.grid}>
              {nutrients.map(n => (
                <View key={n.key} style={[styles.cell, { backgroundColor: c.card, borderColor: c.border }]}>
                  <Text style={[styles.cellValue, { color: c.text, fontFamily: fonts.playfair }]}>{n.value}</Text>
                  <Text style={[styles.cellUnit, { color: c.muted, fontFamily: fonts.dmMono }]}>{n.unit}</Text>
                  <Text style={[styles.cellLabel, { color: c.muted, fontFamily: fonts.dmSans }]}>{n.label}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { fontSize: 28 },
  title: { fontSize: 14, letterSpacing: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: SPACING.md },
  summary: { alignItems: 'center', paddingVertical: SPACING.lg, gap: 4 },
  bigNum: { fontSize: 72, lineHeight: 80 },
  bigLabel: { fontSize: 11, letterSpacing: 2 },
  sub: { fontSize: 12, textAlign: 'center' },
  empty: { fontSize: 14, textAlign: 'center', paddingTop: SPACING.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  cell: { width: '47%', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md, gap: 2, alignItems: 'center' },
  cellValue: { fontSize: 24 },
  cellUnit: { fontSize: 11, letterSpacing: 0.5 },
  cellLabel: { fontSize: 11, textAlign: 'center' },
});
