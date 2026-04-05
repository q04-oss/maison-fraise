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
import { fetchVentures } from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';

export default function VenturesPanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();
  const [ventures, setVentures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetchVentures()
      .then(setVentures)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const renderItem = ({ item }: { item: any }) => {
    const isDorotka = item.ceo_type === 'dorotka';
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: c.border }]}
        onPress={() => showPanel('venture-detail', { ventureId: item.id })}
        activeOpacity={0.7}
      >
        <View style={styles.rowMain}>
          <View style={styles.rowLeft}>
            {isDorotka && (
              <Text style={[styles.dorotkaTag, { color: c.accent, borderColor: c.accent }]}>D</Text>
            )}
            <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>{item.name}</Text>
          </View>
          <Text style={[styles.arrow, { color: c.accent }]}>→</Text>
        </View>
        {item.description ? (
          <Text style={[styles.description, { color: c.muted }]} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: c.muted }]}>
          {isDorotka ? 'dorotka · worker co-op' : 'human-led'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: c.text }]}>ventures</Text>
        </View>
        <TouchableOpacity
          onPress={() => showPanel('venture-create')}
          activeOpacity={0.7}
          style={styles.newBtn}
        >
          <Text style={[styles.newBtnText, { color: c.accent }]}>new +</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : ventures.length === 0 ? (
        <Text style={[styles.empty, { color: c.muted }]}>no ventures yet</Text>
      ) : (
        <FlatList
          data={ventures}
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
  newBtn: { paddingVertical: 4 },
  newBtnText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  empty: {
    textAlign: 'center',
    marginTop: 60,
    fontSize: 13,
    fontFamily: fonts.dmSans,
    fontStyle: 'italic',
    paddingHorizontal: SPACING.md,
  },
  row: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 5,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  dorotkaTag: {
    fontSize: 9,
    fontFamily: fonts.dmMono,
    letterSpacing: 1,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  name: { fontSize: 15, fontFamily: fonts.dmSans, flex: 1 },
  arrow: { fontSize: 16 },
  description: { fontSize: 12, fontFamily: fonts.dmSans, lineHeight: 17 },
  meta: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
});
