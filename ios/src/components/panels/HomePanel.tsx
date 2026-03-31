import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, ActivityIndicator, Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { usePanel, Variety } from '../../context/PanelContext';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { fetchVarieties } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';
import { STRAWBERRIES } from '../../data/seed';
import { RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SHORTCUTS = ['Order again', 'Ready now', 'Gift'];

export default function HomePanel() {
  const navigation = useNavigation<Nav>();
  const { showPanel, varieties, setVarieties, setOrder, activeLocation } = usePanel();
  const c = useColors();
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

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

    const hide = Keyboard.addListener('keyboardWillHide', () => {
      TrueSheet.present('main-sheet', 1);
      setFocused(false);
    });
    return () => hide.remove();
  }, []);

  const handleFocus = () => {
    Keyboard.dismiss();
    showPanel('ask');
    TrueSheet.present('main-sheet', 2);
  };

  const handleCancel = () => {
    setQuery('');
    Keyboard.dismiss();
  };

  const handleVarietyPress = (v: Variety) => {
    setOrder({
      variety_id: v.id,
      variety_name: v.name,
      price_cents: v.price_cents,
      location_id: activeLocation?.id ?? null,
      location_name: activeLocation?.name ?? null,
    });
    showPanel('variety');
    TrueSheet.present('main-sheet', 2);
  };

  return (
    <View style={styles.container}>
      {/* Top row */}
      <View style={styles.topRow}>
        <Text style={[styles.wordmark, { color: c.text }]}>maison fraise</Text>
        {!focused && (
          <TouchableOpacity
            onPress={() => navigation.navigate('Profile')}
            activeOpacity={0.7}
            style={[styles.profileBtn, { borderColor: c.border }]}
          >
            <Text style={[styles.profileIcon, { color: c.muted }]}>⊙</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search bar + cancel */}
      <View style={styles.searchRow}>
        <TextInput
          ref={inputRef}
          style={[styles.searchBar, { backgroundColor: c.searchBg, borderColor: c.searchBorder, color: c.text, flex: 1 }]}
          placeholder=""
          placeholderTextColor={c.muted}
          value={query}
          onChangeText={setQuery}
          onFocus={handleFocus}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        {focused && (
          <TouchableOpacity onPress={handleCancel} activeOpacity={0.7} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, { color: c.accent }]}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Shortcut pills */}
      {!focused && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          {SHORTCUTS.map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.pill, { backgroundColor: c.pillBg, borderColor: c.pillBorder }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, { color: c.text }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Location header */}
      {activeLocation && !focused && (
        <View style={styles.locationHeader}>
          <Text style={[styles.locationTypeLabel, { color: c.muted }]}>COLLECTION POINT</Text>
          <Text style={[styles.locationName, { color: c.text }]}>{activeLocation.name}</Text>
          <Text style={[styles.locationAddress, { color: c.muted }]}>{activeLocation.address}</Text>
        </View>
      )}

      {/* Variety list */}
      <ScrollView
        style={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} />
        ) : varieties.length === 0 ? (
          <Text style={[styles.emptyText, { color: c.muted }]}>Nothing ready today.</Text>
        ) : (
          varieties.map(v => (
            <TouchableOpacity
              key={v.id}
              style={[styles.varietyRow, { borderBottomColor: c.border }]}
              onPress={() => handleVarietyPress(v)}
              activeOpacity={0.8}
            >
              <View style={[styles.varietyDot, { backgroundColor: c.accent }]} />
              <View style={styles.varietyInfo}>
                <Text style={[styles.varietyName, { color: c.text }]}>{v.name}</Text>
                {(v as any).farm && <Text style={[styles.varietyFarm, { color: c.muted }]}>{(v as any).farm}</Text>}
              </View>
              <View style={styles.varietyRight}>
                <Text style={[styles.varietyPrice, { color: c.text }]}>CA${(v.price_cents / 100).toFixed(2)}</Text>
                <Text style={[styles.varietyStock, { color: c.muted }]}>{v.stock_remaining} left</Text>
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
  container: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: 12,
    paddingBottom: 8,
  },
  wordmark: { fontSize: 18, fontFamily: fonts.playfairItalic, letterSpacing: 0.5 },
  profileBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileIcon: { fontSize: 20 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: 10,
    gap: 8,
  },
  searchBar: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    fontFamily: fonts.dmSans,
  },
  cancelBtn: { paddingVertical: 8 },
  cancelText: { fontSize: 16, fontFamily: fonts.dmSans },
  pillRow: { paddingHorizontal: SPACING.md, paddingBottom: 10, gap: 8 },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: { fontSize: 13, fontFamily: fonts.dmSans },
  locationHeader: { paddingHorizontal: SPACING.md, paddingBottom: 10, gap: 3 },
  locationTypeLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  locationName: { fontSize: 22, fontFamily: fonts.playfair },
  locationAddress: { fontSize: 13, fontFamily: fonts.dmSans },
  list: { flex: 1 },
  emptyText: { fontSize: 15, fontFamily: fonts.dmSans, textAlign: 'center', marginTop: 24, fontStyle: 'italic' },
  varietyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  varietyDot: { width: 8, height: 8, borderRadius: 4 },
  varietyInfo: { flex: 1, gap: 3 },
  varietyName: { fontSize: 17, fontFamily: fonts.playfair },
  varietyFarm: { fontSize: 12, fontFamily: fonts.dmSans },
  varietyRight: { alignItems: 'flex-end', gap: 3 },
  varietyPrice: { fontSize: 13, fontFamily: fonts.dmMono },
  varietyStock: { fontSize: 11, fontFamily: fonts.dmSans },
});
