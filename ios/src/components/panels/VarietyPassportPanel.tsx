import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchVarietyPassport } from '../../lib/api';

export default function VarietyPassportPanel() {
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

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>VARIETY PASSPORT</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading && (
        <View style={styles.center}><ActivityIndicator color={c.accent} /></View>
      )}

      {!loading && passport.length === 0 && (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>
            Collect your first order to start your passport.
          </Text>
        </View>
      )}

      {!loading && passport.length > 0 && (
        <>
          <View style={styles.countRow}>
            <Text style={[styles.countNum, { color: c.accent, fontFamily: fonts.playfair }]}>{passport.length}</Text>
            <Text style={[styles.countLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>VARIETIES COLLECTED</Text>
          </View>
          <FlatList
            data={passport}
            keyExtractor={item => String(item.variety_id)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={styles.cardRow}>
                  <Text style={[styles.varietyName, { color: c.text, fontFamily: fonts.playfair }]}>{item.variety_name}</Text>
                  <Text style={[styles.count, { color: c.accent, fontFamily: fonts.dmMono }]}>×{item.order_count}</Text>
                </View>
                {item.source_farm ? (
                  <Text style={[styles.farm, { color: c.muted, fontFamily: fonts.dmMono }]}>{item.source_farm}</Text>
                ) : null}
                {item.first_collected_at ? (
                  <Text style={[styles.date, { color: c.muted, fontFamily: fonts.dmSans }]}>
                    First: {new Date(item.first_collected_at).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}
                  </Text>
                ) : null}
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { fontSize: 28 },
  title: { fontSize: 14, letterSpacing: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg },
  empty: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  countRow: { alignItems: 'center', paddingVertical: SPACING.lg, gap: 4 },
  countNum: { fontSize: 64, lineHeight: 72 },
  countLabel: { fontSize: 11, letterSpacing: 2 },
  list: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: SPACING.sm },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md, gap: 4 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  varietyName: { fontSize: 20 },
  count: { fontSize: 16, letterSpacing: 1 },
  farm: { fontSize: 11, letterSpacing: 0.5 },
  date: { fontSize: 12 },
});
