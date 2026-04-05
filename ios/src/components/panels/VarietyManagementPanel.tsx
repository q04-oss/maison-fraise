import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { fetchAdminVarieties, updateVarietySortOrder } from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';

type Variety = {
  id: number;
  name: string;
  variety_type: string;
  active: boolean;
  sort_order: number;
  price_cents: number;
};

export default function VarietyManagementPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(() => {
    fetchAdminVarieties()
      .then((rows) => {
        const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
        setVarieties(sorted);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const move = useCallback(async (index: number, direction: -1 | 1) => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= varieties.length) return;

    const a = varieties[index];
    const b = varieties[swapIndex];

    // Optimistic update
    const next = [...varieties];
    next[index] = { ...a, sort_order: b.sort_order };
    next[swapIndex] = { ...b, sort_order: a.sort_order };
    next.sort((x, y) => x.sort_order - y.sort_order);
    setVarieties(next);

    setSaving(a.id);
    try {
      await updateVarietySortOrder(a.id, b.sort_order, '');
      await updateVarietySortOrder(b.id, a.sort_order, '');
    } catch {
      // Revert on failure
      load();
    } finally {
      setSaving(null);
    }
  }, [varieties, load]);

  const renderItem = ({ item, index }: { item: Variety; index: number }) => {
    const isSaving = saving === item.id;
    const anyBusy = saving !== null || loading;
    const typeLabel = item.variety_type === 'chocolate' ? 'chocolate' : 'strawberry';
    return (
      <View style={[styles.row, { borderBottomColor: c.border }]}>
        <View style={styles.rowInfo}>
          <Text style={[styles.name, { color: item.active ? c.text : c.muted }]} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.meta}>
            <Text style={[styles.metaText, { color: c.muted }]}>{typeLabel}</Text>
            {!item.active && (
              <Text style={[styles.metaText, { color: c.muted, fontStyle: 'italic' }]}>inactive</Text>
            )}
          </View>
        </View>
        <View style={styles.controls}>
          {isSaving ? (
            <ActivityIndicator color={c.accent} style={{ width: 64 }} />
          ) : (
            <>
              <TouchableOpacity
                onPress={() => move(index, -1)}
                disabled={anyBusy || index === 0}
                activeOpacity={0.6}
                style={[styles.arrow, (anyBusy || index === 0) && { opacity: 0.2 }]}
              >
                <Text style={[styles.arrowText, { color: c.accent }]}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => move(index, 1)}
                disabled={anyBusy || index === varieties.length - 1}
                activeOpacity={0.6}
                style={[styles.arrow, (anyBusy || index === varieties.length - 1) && { opacity: 0.2 }]}
              >
                <Text style={[styles.arrowText, { color: c.accent }]}>↓</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: c.text }]}>varieties</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : varieties.length === 0 ? (
        <Text style={[styles.empty, { color: c.muted }]}>no varieties</Text>
      ) : (
        <FlatList
          data={varieties}
          keyExtractor={(v) => String(v.id)}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
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
  backBtn: { paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { textAlign: 'center', fontSize: 17, fontFamily: fonts.playfair },
  headerSpacer: { width: 28 },
  empty: {
    textAlign: 'center',
    marginTop: 60,
    fontSize: 13,
    fontFamily: fonts.dmSans,
    fontStyle: 'italic',
    paddingHorizontal: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowInfo: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontFamily: fonts.dmSans },
  meta: { flexDirection: 'row', gap: 10 },
  metaText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  controls: { flexDirection: 'row', gap: 4 },
  arrow: { padding: 8 },
  arrowText: { fontSize: 18, lineHeight: 22 },
});
