import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { fetchAdminVarieties, updateVarietySortOrder, updateVarietyTier, autoAssignVarietyTiers } from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';

type SocialTier = 'standard' | 'reserve' | 'estate' | null;

type Variety = {
  id: number;
  name: string;
  variety_type: string;
  active: boolean;
  sort_order: number;
  price_cents: number;
  social_tier: SocialTier;
  time_credits_days: number;
};

const TIERS: Array<{ value: SocialTier; label: string; days: number }> = [
  { value: 'standard', label: 'STD', days: 30 },
  { value: 'reserve',  label: 'RES', days: 60 },
  { value: 'estate',   label: 'EST', days: 120 },
];

const TIER_COLORS: Record<string, string> = {
  standard: '#8E8E93',
  reserve:  '#007AFF',
  estate:   '#C9973A',
};

export default function VarietyManagementPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const [varieties, setVarieties] = useState<Variety[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(() => {
    fetchAdminVarieties()
      .then((rows) => {
        const sorted = [...rows].sort((a: Variety, b: Variety) => a.sort_order - b.sort_order);
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
      load();
    } finally {
      setSaving(null);
    }
  }, [varieties, load]);

  const setTier = useCallback(async (variety: Variety, tier: SocialTier) => {
    if (!tier || saving !== null) return;
    const match = TIERS.find(t => t.value === tier);
    const days = match?.days ?? 30;
    setVarieties(prev => prev.map(v => v.id === variety.id ? { ...v, social_tier: tier, time_credits_days: days } : v));
    setSaving(variety.id);
    try {
      await updateVarietyTier(variety.id, tier, days);
    } catch {
      load();
      Alert.alert('Error', 'Failed to update tier.');
    } finally {
      setSaving(null);
    }
  }, [saving, load]);

  const handleAutoAssign = useCallback(() => {
    Alert.alert(
      'Auto-assign tiers',
      'Assign tiers by price: bottom third → Standard (30d), middle third → Reserve (60d), top third → Estate (120d). This will overwrite existing tier settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Assign',
          onPress: async () => {
            setAssigning(true);
            try {
              const result = await autoAssignVarietyTiers();
              load();
              Alert.alert('Done', `${result.assigned} varieties assigned.\nStandard: ${result.breakdown.standard} · Reserve: ${result.breakdown.reserve} · Estate: ${result.breakdown.estate}`);
            } catch {
              Alert.alert('Error', 'Auto-assign failed.');
            } finally {
              setAssigning(false);
            }
          },
        },
      ],
    );
  }, [load]);

  const renderItem = ({ item, index }: { item: Variety; index: number }) => {
    const isSaving = saving === item.id;
    const anyBusy = saving !== null || loading;
    const typeLabel = item.variety_type === 'chocolate' ? 'chocolate' : 'strawberry';
    const tierColor = item.social_tier ? TIER_COLORS[item.social_tier] : c.border;

    return (
      <View style={[styles.row, { borderBottomColor: c.border }]}>
        <View style={styles.rowInfo}>
          <Text style={[styles.name, { color: item.active ? c.text : c.muted }]} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.meta}>
            <Text style={[styles.metaText, { color: c.muted }]}>{typeLabel}</Text>
            <Text style={[styles.metaText, { color: c.muted }]}>€{(item.price_cents / 100).toFixed(2)}</Text>
            {!item.active && (
              <Text style={[styles.metaText, { color: c.muted, fontStyle: 'italic' }]}>inactive</Text>
            )}
          </View>
          {/* Tier selector */}
          <View style={styles.tierRow}>
            {TIERS.map(t => {
              const active = item.social_tier === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  onPress={() => setTier(item, t.value)}
                  disabled={isSaving || assigning}
                  activeOpacity={0.7}
                  style={[
                    styles.tierPill,
                    {
                      backgroundColor: active ? TIER_COLORS[t.value] : 'transparent',
                      borderColor: active ? TIER_COLORS[t.value] : c.border,
                      opacity: isSaving ? 0.4 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.tierPillText, { fontFamily: fonts.dmMono, color: active ? '#fff' : c.muted }]}>
                    {t.label}
                  </Text>
                  <Text style={[styles.tierPillDays, { fontFamily: fonts.dmMono, color: active ? '#fff' : c.muted }]}>
                    {t.days}d
                  </Text>
                </TouchableOpacity>
              );
            })}
            {!item.social_tier && (
              <Text style={[styles.metaText, { color: c.muted, fontStyle: 'italic', alignSelf: 'center' }]}>unset</Text>
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
        <TouchableOpacity onPress={handleAutoAssign} disabled={assigning} activeOpacity={0.7}>
          {assigning
            ? <ActivityIndicator color={c.accent} style={{ width: 48 }} />
            : <Text style={[styles.autoBtn, { color: c.accent, fontFamily: fonts.dmMono }]}>auto</Text>
          }
        </TouchableOpacity>
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
  autoBtn: { fontSize: 13, letterSpacing: 0.5 },
  empty: {
    textAlign: 'center', marginTop: 60, fontSize: 13,
    fontFamily: fonts.dmSans, fontStyle: 'italic', paddingHorizontal: SPACING.md,
  },
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: SPACING.md, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowInfo: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontFamily: fonts.dmSans },
  meta: { flexDirection: 'row', gap: 10 },
  metaText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  tierRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  tierPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  tierPillText: { fontSize: 10, letterSpacing: 0.5 },
  tierPillDays: { fontSize: 9, opacity: 0.8 },
  controls: { flexDirection: 'row', gap: 4, paddingTop: 4 },
  arrow: { padding: 8 },
  arrowText: { fontSize: 18, lineHeight: 22 },
});
