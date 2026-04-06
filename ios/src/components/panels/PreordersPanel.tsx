import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchPreorders, cancelPreorder, fetchVarieties, createPreorder } from '../../lib/api';

export default function PreordersPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [preorders, setPreorders] = useState<any[]>([]);
  const [varieties, setVarieties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [placing, setPlacing] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([fetchPreorders(), fetchVarieties()])
      .then(([po, vars]) => { setPreorders(po); setVarieties(vars); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCancel = async (id: number) => {
    setCancelling(id);
    try {
      await cancelPreorder(id);
      setPreorders(ps => ps.filter(p => p.id !== id));
    } catch { } finally { setCancelling(null); }
  };

  const handlePlace = async (varietyId: number) => {
    setPlacing(varietyId);
    try {
      const po = await createPreorder(varietyId);
      setPreorders(ps => [po, ...ps]);
    } catch { } finally { setPlacing(null); }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>PRE-ORDERS</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading && (
        <View style={styles.center}><ActivityIndicator color={c.accent} /></View>
      )}

      {!loading && (
        <FlatList
          data={varieties.filter(v => !preorders.find(p => p.variety_id === v.id))}
          keyExtractor={item => `v-${item.id}`}
          ListHeaderComponent={
            preorders.length > 0 ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>YOUR PRE-ORDERS</Text>
                {preorders.map(po => (
                  <View key={po.id} style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
                    <Text style={[styles.variety, { color: c.text, fontFamily: fonts.playfair }]}>{po.variety_name ?? `Variety #${po.variety_id}`}</Text>
                    <TouchableOpacity
                      onPress={() => handleCancel(po.id)}
                      disabled={cancelling === po.id}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.cancelText, { color: '#EF4444', fontFamily: fonts.dmMono }]}>
                        {cancelling === po.id ? 'Cancelling…' : 'CANCEL'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <Text style={[styles.sectionLabel, { color: c.muted, fontFamily: fonts.dmMono, marginTop: SPACING.md }]}>ADD MORE</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            preorders.length === 0 ? (
              <View style={styles.center}>
                <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>No upcoming varieties available for pre-order.</Text>
              </View>
            ) : null
          }
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={() => handlePlace(item.id)}
              disabled={placing === item.id}
              activeOpacity={0.8}
            >
              <Text style={[styles.variety, { color: c.text, fontFamily: fonts.playfair }]}>{item.name}</Text>
              <Text style={[styles.meta, { color: c.accent, fontFamily: fonts.dmMono }]}>
                {placing === item.id ? 'Placing…' : 'PRE-ORDER →'}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { fontSize: 28 },
  title: { fontSize: 14, letterSpacing: 2 },
  center: { padding: SPACING.lg, alignItems: 'center' },
  empty: { fontSize: 14, textAlign: 'center' },
  list: { padding: SPACING.md, gap: SPACING.sm },
  section: { gap: SPACING.sm, marginBottom: SPACING.sm },
  sectionLabel: { fontSize: 11, letterSpacing: 1.5 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  variety: { fontSize: 18 },
  meta: { fontSize: 12, letterSpacing: 1 },
  cancelText: { fontSize: 12, letterSpacing: 1 },
});
