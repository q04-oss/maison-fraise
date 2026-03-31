import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Animated, ActivityIndicator,
} from 'react-native';
import { usePanel, Variety } from '../../context/PanelContext';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { fetchVarieties } from '../../lib/api';
import { colors, fonts } from '../../theme';
import { SPACING } from '../../theme';
import { STRAWBERRIES } from '../../data/seed';

const SHORTCUTS = ['Order again', 'Ready now', 'Gift'];

export default function HomePanel() {
  const { showPanel, varieties, setVarieties, setOrder, activeLocation } = usePanel();
  const [loading, setLoading] = useState(true);
  const cursorAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fetchVarieties()
      .then((data: any[]) => {
        const merged = data.map(v => {
          const seed = STRAWBERRIES.find(s => s.name === v.name);
          return { ...seed, ...v };
        });
        setVarieties(merged);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    Animated.loop(
      Animated.sequence([
        Animated.timing(cursorAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleVarietyPress = (v: Variety) => {
    setOrder({ variety_id: v.id, variety_name: v.name, price_cents: v.price_cents });
    showPanel('variety');
    TrueSheet.present('main-sheet', 2);
  };

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <TouchableOpacity
        style={styles.searchBar}
        onPress={() => {
          showPanel('ask');
          TrueSheet.present('main-sheet', 2);
        }}
        activeOpacity={0.9}
      >
        <Animated.View style={[styles.cursor, { opacity: cursorAnim }]} />
        <Text style={styles.searchPlaceholder}>Ask about today's strawberries…</Text>
      </TouchableOpacity>

      {/* Shortcut pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
        {SHORTCUTS.map(s => (
          <TouchableOpacity key={s} style={styles.pill} activeOpacity={0.7}>
            <Text style={styles.pillText}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Location header */}
      {activeLocation && (
        <View style={styles.locationHeader}>
          <Text style={styles.locationTypeLabel}>COLLECTION POINT</Text>
          <Text style={styles.locationName}>{activeLocation.name}</Text>
          <Text style={styles.locationAddress}>{activeLocation.address}</Text>
        </View>
      )}

      {/* Variety list */}
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.green} style={{ marginTop: 24 }} />
        ) : varieties.length === 0 ? (
          <Text style={styles.emptyText}>Nothing ready today.</Text>
        ) : (
          varieties.map(v => (
            <TouchableOpacity
              key={v.id}
              style={styles.varietyRow}
              onPress={() => handleVarietyPress(v)}
              activeOpacity={0.8}
            >
              <View style={[styles.varietyDot, { backgroundColor: (v as any).freshnessColor ?? colors.green }]} />
              <View style={styles.varietyInfo}>
                <Text style={styles.varietyName}>{v.name}</Text>
                {(v as any).farm && <Text style={styles.varietyFarm}>{(v as any).farm}</Text>}
              </View>
              <View style={styles.varietyRight}>
                <Text style={styles.varietyPrice}>CA${(v.price_cents / 100).toFixed(2)}</Text>
                <Text style={styles.varietyStock}>{v.stock_remaining} left</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 8, backgroundColor: '#F5F0E8' },
  searchBar: {
    marginHorizontal: SPACING.md,
    marginBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  cursor: {
    width: 2,
    height: 16,
    backgroundColor: colors.text,
    borderRadius: 1,
  },
  pillRow: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 10,
    gap: 8,
  },
  pill: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  pillText: {
    fontSize: 13,
    color: colors.text,
    fontFamily: fonts.dmSans,
  },
  locationHeader: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 10,
    gap: 2,
  },
  locationTypeLabel: {
    fontSize: 10,
    color: colors.muted,
    fontFamily: fonts.dmMono,
    letterSpacing: 1.5,
  },
  locationName: {
    fontSize: 20,
    color: colors.text,
    fontFamily: fonts.playfair,
  },
  locationAddress: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.dmSans,
  },
  searchPlaceholder: {
    fontSize: 14,
    color: colors.muted,
    fontFamily: fonts.dmSans,
    marginLeft: 8,
  },
  list: { flex: 1 },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    fontFamily: fonts.dmSans,
    textAlign: 'center',
    marginTop: 24,
    fontStyle: 'italic',
  },
  varietyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    gap: 10,
  },
  varietyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  varietyInfo: { flex: 1, gap: 2 },
  varietyName: { fontSize: 15, color: colors.text, fontFamily: fonts.playfair },
  varietyFarm: { fontSize: 11, color: colors.muted, fontFamily: fonts.dmSans },
  varietyRight: { alignItems: 'flex-end', gap: 2 },
  varietyPrice: { fontSize: 12, color: colors.text, fontFamily: fonts.dmMono },
  varietyStock: { fontSize: 10, color: colors.muted, fontFamily: fonts.dmSans },
});
