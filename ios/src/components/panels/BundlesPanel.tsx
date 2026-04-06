import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchBundles, orderBundle } from '../../lib/api';

export default function BundlesPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [bundles, setBundles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState<number | null>(null);
  const [ordered, setOrdered] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchBundles()
      .then(setBundles)
      .catch(() => setBundles([]))
      .finally(() => setLoading(false));
  }, []);

  const handleOrder = async (bundleId: number) => {
    setOrdering(bundleId);
    try {
      await orderBundle(bundleId);
      setOrdered(prev => new Set([...prev, bundleId]));
    } catch { } finally { setOrdering(null); }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>BUNDLES</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading && (
        <View style={styles.center}><ActivityIndicator color={c.accent} /></View>
      )}

      {!loading && bundles.length === 0 && (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>No bundles available.</Text>
        </View>
      )}

      {!loading && (
        <FlatList
          data={bundles}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.name, { color: c.text, fontFamily: fonts.playfair }]}>{item.name}</Text>
              {item.description ? (
                <Text style={[styles.desc, { color: c.muted, fontFamily: fonts.dmSans }]} numberOfLines={2}>{item.description}</Text>
              ) : null}
              {item.varieties?.length > 0 && (
                <Text style={[styles.varieties, { color: c.muted, fontFamily: fonts.dmMono }]}>
                  {(item.varieties as any[]).map((v: any) => v.name).join(' · ')}
                </Text>
              )}
              <View style={styles.footer}>
                {item.price_cents != null && (
                  <Text style={[styles.price, { color: c.text, fontFamily: fonts.playfair }]}>
                    CA${(item.price_cents / 100).toFixed(2)}
                  </Text>
                )}
                {ordered.has(item.id) ? (
                  <Text style={[styles.ordered, { color: c.accent, fontFamily: fonts.dmMono }]}>ORDERED</Text>
                ) : (
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: c.accent }, ordering === item.id && { opacity: 0.6 }]}
                    onPress={() => handleOrder(item.id)}
                    disabled={ordering === item.id}
                    activeOpacity={0.8}
                  >
                    {ordering === item.id ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={[styles.btnText, { fontFamily: fonts.dmMono }]}>ORDER →</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 14 },
  list: { padding: SPACING.md, gap: SPACING.sm },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md, gap: 8 },
  name: { fontSize: 22 },
  desc: { fontSize: 13, lineHeight: 18 },
  varieties: { fontSize: 11, letterSpacing: 0.5 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  price: { fontSize: 20 },
  btn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  btnText: { color: '#fff', fontSize: 12, letterSpacing: 1.5 },
  ordered: { fontSize: 12, letterSpacing: 1 },
});
