import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, ActivityIndicator, Keyboard, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { fetchBusinesses, fetchVarieties, fetchOrdersByEmail } from '../../lib/api';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';
import { STRAWBERRIES, getDateOptions } from '../../data/seed';

const SHORTCUTS = [
  { label: 'Order again', icon: '↩' },
  { label: 'Ready now', icon: '🍓' },
  { label: 'Gift', icon: '◇' },
] as const;

export default function HomePanel() {
  const { showPanel, setVarieties, setOrder, setBusinesses, setActiveLocation, businesses, varieties, sheetHeight } = usePanel();
  const c = useColors();
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [giftActive, setGiftActive] = useState(false);
  const [readyNowActive, setReadyNowActive] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const collectionPoints = businesses.filter(b => b.type === 'collection');
  const isCollapsed = sheetHeight > 0 && sheetHeight < 120;

  useEffect(() => {
    Promise.all([
      fetchBusinesses(),
      fetchVarieties(),
    ]).then(([biz, vars]) => {
      setBusinesses(biz);
      const merged = vars.map((v: any) => {
        const seed = STRAWBERRIES.find(s => s.name === v.name);
        return { ...seed, ...v };
      });
      setVarieties(merged);
    }).catch(() => {}).finally(() => setLoading(false));

    const hide = Keyboard.addListener('keyboardWillHide', () => {
      TrueSheet.present('main-sheet', 1);
    });
    return () => hide.remove();
  }, []);

  const handleFocus = () => {
    Keyboard.dismiss();
    showPanel('ask');
    TrueSheet.present('main-sheet', 2);
  };

  const handleOrderAgain = async () => {
    const email = await AsyncStorage.getItem('user_email');
    if (!email) {
      Alert.alert('Sign in first', 'Use the profile button to sign in, then your order history will be available here.');
      return;
    }
    try {
      const orders = await fetchOrdersByEmail(email);
      const paid = (orders as any[]).filter((o: any) => o.status === 'paid');
      if (paid.length === 0) {
        Alert.alert('No orders yet', 'Your first completed order will appear here.');
        return;
      }
      const last = paid[paid.length - 1];
      const matchedVariety = varieties.find(v => v.id === last.variety_id);
      const matchedBusiness = businesses.find(b => b.id === last.location_id);
      setOrder({
        variety_id: last.variety_id ?? null,
        variety_name: last.variety_name ?? matchedVariety?.name ?? null,
        price_cents: last.price_cents ?? matchedVariety?.price_cents ?? null,
        chocolate: last.chocolate ?? null,
        chocolate_name: last.chocolate ?? null,
        finish: last.finish ?? null,
        finish_name: last.finish ?? null,
        quantity: last.quantity ?? 4,
        is_gift: last.is_gift ?? false,
        location_id: last.location_id ?? null,
        location_name: matchedBusiness?.name ?? null,
      });
      showPanel('when');
      TrueSheet.present('main-sheet', 2);
    } catch {
      Alert.alert('Could not load orders', 'Please try again.');
    }
  };

  const handleShortcut = (label: string) => {
    if (label === 'Gift') {
      const next = !giftActive;
      setGiftActive(next);
      setOrder({ is_gift: next });
      TrueSheet.present('main-sheet', 2);
    } else if (label === 'Ready now') {
      const next = !readyNowActive;
      setReadyNowActive(next);
      setOrder({ date: next ? getDateOptions()[0].isoDate : null, time_slot_id: null, time_slot_time: null });
      TrueSheet.present('main-sheet', 2);
    } else if (label === 'Order again') {
      handleOrderAgain();
    }
  };

  const handleLocationPress = (biz: any) => {
    setActiveLocation(biz);
    setOrder({ location_id: biz.id, location_name: biz.name });
    showPanel('location');
    TrueSheet.present('main-sheet', 2);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      {/* Search bar + profile — visible at all detents */}
      <View style={styles.searchRow}>
        <TextInput
          ref={inputRef}
          style={[styles.searchBar, { backgroundColor: c.searchBg, borderColor: c.searchBorder, color: c.text }]}
          placeholder="Maison Fraise"
          placeholderTextColor={c.text}
          value={query}
          onChangeText={setQuery}
          onFocus={handleFocus}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
        <TouchableOpacity
          onPress={() => { showPanel('profile'); TrueSheet.present('main-sheet', 1); }}
          activeOpacity={0.7}
          style={[styles.profileBtn, { backgroundColor: c.searchBg, borderColor: c.searchBorder }]}
        >
          <Text style={[styles.profileIcon, { color: c.muted }]}>⊙</Text>
        </TouchableOpacity>
      </View>

      {!isCollapsed && (
        <>
          {/* Shortcuts */}
          <View style={styles.shortcutRow}>
            {SHORTCUTS.map(s => {
              const isGiftActive = s.label === 'Gift' && giftActive;
              const isActive = isGiftActive || (s.label === 'Ready now' && readyNowActive);
              return (
                <TouchableOpacity
                  key={s.label}
                  style={[
                    styles.shortcutCard,
                    { backgroundColor: c.card, borderColor: c.border },
                    isActive && { backgroundColor: c.accent, borderColor: 'transparent' },
                  ]}
                  onPress={() => handleShortcut(s.label)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.shortcutIcon}>{s.icon}</Text>
                  <Text style={[styles.shortcutLabel, { color: isActive ? '#fff' : c.text }]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Collection locations */}
          <Text style={[styles.sectionLabel, { color: c.muted }]}>COLLECTION POINTS</Text>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {loading ? (
              <ActivityIndicator color={c.accent} style={{ marginTop: 32 }} />
            ) : collectionPoints.length === 0 ? (
              <Text style={[styles.emptyText, { color: c.muted }]}>No collection points available.</Text>
            ) : (
              collectionPoints.map(biz => (
                <TouchableOpacity
                  key={biz.id}
                  style={[styles.locationRow, { borderBottomColor: c.border }]}
                  onPress={() => handleLocationPress(biz)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.locationDot, { backgroundColor: c.accent }]} />
                  <View style={styles.locationInfo}>
                    <Text style={[styles.locationName, { color: c.text }]}>{biz.name}</Text>
                    <Text style={[styles.locationAddress, { color: c.muted }]}>{biz.address}</Text>
                  </View>
                  <Text style={[styles.locationChevron, { color: c.muted }]}>›</Text>
                </TouchableOpacity>
              ))
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    gap: 10,
  },
  searchBar: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    fontFamily: fonts.playfairItalic,
  },
  profileBtn: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  profileIcon: { fontSize: 18 },
  shortcutRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingBottom: 16,
    gap: 8,
  },
  shortcutCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  shortcutIcon: { fontSize: 20 },
  shortcutLabel: { fontSize: 11, fontFamily: fonts.dmSans, textAlign: 'center' },
  sectionLabel: {
    fontSize: 10,
    fontFamily: fonts.dmMono,
    letterSpacing: 1.5,
    paddingHorizontal: SPACING.md,
    paddingBottom: 8,
  },
  list: { flex: 1 },
  emptyText: { fontSize: 15, fontFamily: fonts.dmSans, textAlign: 'center', marginTop: 32, fontStyle: 'italic' },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  locationDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  locationInfo: { flex: 1, gap: 4 },
  locationName: { fontSize: 18, fontFamily: fonts.playfair },
  locationAddress: { fontSize: 12, fontFamily: fonts.dmSans },
  locationChevron: { fontSize: 22 },
});
