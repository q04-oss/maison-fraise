import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  RefreshControl, StyleSheet, ActivityIndicator, FlatList, TextInput, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useStripe } from '@stripe/stripe-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel, Variety, Business } from '../../context/PanelContext';
import { useApp } from '../../../App';
import {
  fetchVarieties, fetchTodayStats, fetchBatchStatus,
  createOrder, confirmOrder, payOrderWithBalance,
  fetchOrdersByEmail, fetchAdBalance,
} from '../../lib/api';
import { useColors, fonts, SPACING } from '../../theme';
import { STRAWBERRIES, CHOCOLATES, FINISHES } from '../../data/seed';
import { haversineKm, formatDistanceKm } from '../../lib/geo';

const SHEET_NAME = 'main-sheet';

type OrderStep = 'variety' | 'chocolate' | 'finish' | 'quantity' | 'review' | 'confirmed';

function formatHarvestDate(iso: string): string {
  const d = new Date(iso);
  const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export default function HomePanel() {
  const {
    setVarieties, setActiveLocation, varieties, activeLocation,
    businesses, sheetHeight, showPanel,
    order, setOrder, userCoords,
    panelData, setPanelData,
    setHighlightedBizId,
  } = usePanel();
  const { pushToken } = useApp();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const insets = useSafeAreaInsets();
  const c = useColors();

  const now = new Date();
  const isCollapsed = sheetHeight < 110;
  const month = now.getMonth() + 1;
  const season = month >= 3 && month <= 5 ? 'spring'
    : month >= 6 && month <= 8 ? 'summer'
    : month >= 9 && month <= 11 ? 'autumn'
    : 'winter';
  const isOrderableLocation = !!activeLocation && (activeLocation.type === 'collection' || activeLocation.type === 'popup');

  // ── Auth state ──
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userDbId, setUserDbId] = useState<number | null>(null);
  const [adBalanceCents, setAdBalanceCents] = useState(0);

  useEffect(() => {
    AsyncStorage.multiGet(['user_email', 'user_db_id', 'display_name']).then(([email, dbId, name]) => {
      if (email[1]) setUserEmail(email[1]);
      if (dbId[1]) setUserDbId(parseInt(dbId[1], 10));
      if (name[1]) setInitials(nameToInitials(name[1]));
    });
    fetchAdBalance().then(r => setAdBalanceCents(r.ad_balance_cents)).catch(() => {});
  }, []);

  // Handle panelData signals
  useEffect(() => {
    if (!panelData) return;
    if (panelData.signedIn) {
      setPanelData(null);
      AsyncStorage.multiGet(['user_email', 'user_db_id', 'display_name']).then(([email, dbId, name]) => {
        if (email[1]) setUserEmail(email[1]);
        if (dbId[1]) setUserDbId(parseInt(dbId[1], 10));
        if (name[1]) setInitials(nameToInitials(name[1]));
      });
    } else if (panelData.preselectedVariety) {
      const v = panelData.preselectedVariety;
      setPanelData(null);
      setInlineOrder(p => ({ ...p, variety_id: v.id, variety_name: v.name, price_cents: v.price_cents }));
      setOrderStep('chocolate');
      setTimeout(() => TrueSheet.resize(SHEET_NAME, 1), 200);
    }
  }, [panelData]);

  // ── Order flow state ──
  const [orderStep, setOrderStep] = useState<OrderStep>('variety');
  const [inlineOrder, setInlineOrder] = useState({
    variety_id: null as number | null,
    variety_name: null as string | null,
    price_cents: null as number | null,
    chocolate: null as string | null,
    chocolate_name: null as string | null,
    finish: null as string | null,
    finish_name: null as string | null,
    quantity: 4,
  });
  const [paying, setPaying] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<any>(null);
  const scrollRef = useRef<ScrollView>(null);

  const totalCents = (inlineOrder.price_cents ?? 0) * inlineOrder.quantity;
  const orderInProgress = inlineOrder.variety_id !== null || orderStep === 'confirmed';

  const resetOrder = () => {
    setInlineOrder({ variety_id: null, variety_name: null, price_cents: null, chocolate: null, chocolate_name: null, finish: null, finish_name: null, quantity: 4 });
    setOrderStep('variety');
    setConfirmedOrder(null);
  };

  // Reset order when location changes
  useEffect(() => { resetOrder(); }, [activeLocation?.id]);

  // Re-expand sheet after Stripe collapses it
  useEffect(() => {
    if (orderStep === 'confirmed') setTimeout(() => TrueSheet.resize(SHEET_NAME, 1), 400);
  }, [orderStep]);

  const stepDone = (step: OrderStep) => {
    const steps: OrderStep[] = ['variety', 'chocolate', 'finish', 'quantity', 'review', 'confirmed'];
    return steps.indexOf(orderStep) > steps.indexOf(step);
  };

  const scrollToBottom = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

  // ── Varieties + batch state ──
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [batchStatus, setBatchStatus] = useState<Record<number, { queued_boxes: number; min_quantity: number }>>({});
  const hasFetched = useRef(false);

  const bizVarieties = activeLocation
    ? varieties.filter((v: any) => (v.variety_type ?? 'strawberry') === 'strawberry')
    : [];

  useEffect(() => {
    if (!activeLocation?.id) { setBatchStatus({}); return; }
    let cancelled = false;
    fetchBatchStatus(activeLocation.id).then(rows => {
      if (cancelled) return;
      const map: Record<number, { queued_boxes: number; min_quantity: number }> = {};
      rows.forEach(r => { map[r.variety_id] = { queued_boxes: r.queued_boxes, min_quantity: r.min_quantity }; });
      setBatchStatus(map);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeLocation?.id]);

  const loadVarieties = async () => {
    if (hasFetched.current || varieties.length > 0) { setLoading(false); return; }
    hasFetched.current = true;
    setFetchError(false);
    setLoading(true);
    try {
      const vars: any[] = await fetchVarieties();
      const merged = vars.map((v: any) => {
        const seed = STRAWBERRIES.find(s => s.name === v.name);
        return { ...(seed ?? {}), ...v, harvestDate: v.harvest_date ?? seed?.harvestDate };
      });
      setVarieties(merged);
    } catch {
      hasFetched.current = false;
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadVarieties(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    hasFetched.current = true;
    try {
      const vars: any[] = await fetchVarieties();
      const merged = vars.map((v: any) => {
        const seed = STRAWBERRIES.find(s => s.name === v.name);
        return { ...(seed ?? {}), ...v, harvestDate: v.harvest_date ?? seed?.harvestDate };
      });
      setVarieties(merged);
    } catch {
      hasFetched.current = false;
    } finally {
      setRefreshing(false);
    }
  };

  // ── Discover / search ──
  const [initials, setInitials] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<TextInput>(null);

  function nameToInitials(name: string) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return businesses.filter((b: Business) => {
      if (!b.lat || !b.lng) return false;
      return (
        b.name.toLowerCase().includes(q) ||
        ((b as any).neighbourhood ?? '').toLowerCase().includes(q) ||
        ((b as any).city ?? '').toLowerCase().includes(q)
      );
    });
  }, [businesses, searchQuery]);

  const formatDist = (b: Business): string | null => {
    if (!userCoords) return null;
    return formatDistanceKm(haversineKm(userCoords.latitude, userCoords.longitude, b.lat, b.lng));
  };

  const handleLocationSelect = (b: Business) => {
    setHighlightedBizId(b.id);
    setTimeout(() => setHighlightedBizId(null), 2500);
    if (b.type === 'partner') {
      setActiveLocation(b);
      showPanel('partner-detail', { partnerBusiness: b });
      setTimeout(() => TrueSheet.resize(SHEET_NAME, 1), 350);
    } else {
      setActiveLocation(b);
      setOrder({ location_id: (b as any).location_id ?? b.id, location_name: b.name });
    }
  };

  // ── Nearest collection point ──
  const nearestCollection = useMemo(() => {
    if (!userCoords) return null;
    const candidates = businesses.filter((b: any) => b.lat && b.lng && b.type === 'collection');
    if (candidates.length === 0) return null;
    return candidates.reduce((best: any, b: any) => {
      const d = haversineKm(userCoords.latitude, userCoords.longitude, b.lat, b.lng);
      return d < best.dist ? { biz: b, dist: d } : best;
    }, { biz: candidates[0], dist: Infinity }).biz as Business;
  }, [businesses, userCoords]);

  // ── Other locations switcher ──
  const otherLocations = businesses.filter((b: any) => {
    if (b.id === activeLocation?.id) return false;
    if (b.type === 'collection') return true;
    if (b.type === 'popup') {
      if (!b.launched_at) return false;
      const d = new Date(b.launched_at); d.setHours(23, 59, 59, 999);
      return d >= now;
    }
    return false;
  });

  // ── Payment ──
  const handlePay = async () => {
    if (!userEmail) { Alert.alert('Sign in required', 'Sign in via your profile to place an order.'); return; }
    if (!activeLocation?.id) { Alert.alert('No location', 'Select a collection point on the map first.'); return; }
    if (!inlineOrder.variety_id || !inlineOrder.chocolate || !inlineOrder.finish) return;

    const isPopupLive = (() => {
      if (activeLocation?.type !== 'popup' || !activeLocation.launched_at) return false;
      const start = new Date(activeLocation.launched_at);
      const end = activeLocation.ends_at ? new Date(activeLocation.ends_at) : new Date(start.getTime() + 4 * 60 * 60 * 1000);
      return new Date() >= start && new Date() < end;
    })();

    setPaying(true);
    let paymentCollected = false;
    try {
      const { order: created, client_secret } = await createOrder({
        variety_id: inlineOrder.variety_id!,
        location_id: activeLocation.id,
        chocolate: inlineOrder.chocolate!,
        finish: inlineOrder.finish!,
        quantity: inlineOrder.quantity,
        is_gift: false,
        customer_email: userEmail,
        push_token: pushToken,
        gift_note: null,
        ordered_at_popup: isPopupLive,
        excess_amount_cents: undefined,
      });
      const { error: initErr } = await initPaymentSheet({
        merchantDisplayName: 'Box Fraise',
        paymentIntentClientSecret: client_secret,
        applePay: { merchantCountryCode: 'CA', merchantIdentifier: 'merchant.com.boxfraise.app' },
        defaultBillingDetails: { email: userEmail },
        appearance: {
          colors: {
            primary: c.accent, background: '#FFFFFF',
            componentBackground: '#F7F5F2', componentText: '#1C1C1E',
            componentBorder: '#E5E1DA', placeholderText: '#8E8E93',
          },
        },
      });
      if (initErr) throw new Error(initErr.message);
      TrueSheet.present(SHEET_NAME, 0);
      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) {
        setTimeout(() => TrueSheet.present(SHEET_NAME, 1), 150);
        if (presentErr.code === 'Canceled') { setPaying(false); return; }
        throw new Error(presentErr.message);
      }
      paymentCollected = true;
      const confirmed = await confirmOrder(created.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmedOrder(confirmed);
      setOrderStep('confirmed');
      setOrder({ order_id: confirmed.id, order_status: confirmed.status, location_id: activeLocation.id });
    } catch (err: unknown) {
      if (paymentCollected) {
        Alert.alert('Payment received.', 'Your order is confirmed — check your order history.');
        setTimeout(() => TrueSheet.present(SHEET_NAME, 1), 150);
      } else {
        Alert.alert('Something went wrong.', err instanceof Error ? err.message : 'Try again.');
      }
    } finally {
      setPaying(false);
    }
  };

  const handlePayWithBalance = async () => {
    if (!activeLocation?.id || !inlineOrder.variety_id || !inlineOrder.chocolate || !inlineOrder.finish) return;
    setPaying(true);
    try {
      const confirmed = await payOrderWithBalance({
        variety_id: inlineOrder.variety_id!,
        location_id: activeLocation.id,
        chocolate: inlineOrder.chocolate!,
        finish: inlineOrder.finish!,
        quantity: inlineOrder.quantity,
        is_gift: false,
        push_token: pushToken,
        gift_note: null,
      });
      setAdBalanceCents(prev => prev - totalCents);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConfirmedOrder(confirmed);
      setOrderStep('confirmed');
      setOrder({ order_id: confirmed.id, order_status: confirmed.status, location_id: activeLocation.id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Try again.';
      if (msg === 'insufficient_balance') Alert.alert('Insufficient balance', 'Pay with card instead.');
      else if (msg === 'sold_out') Alert.alert('Sold out', 'This variety is no longer available.');
      else Alert.alert('Something went wrong.', msg);
    } finally {
      setPaying(false);
    }
  };

  return (
    <View style={styles.container}>

      {/* Search bar — always visible when no active location */}
      {!isOrderableLocation && (
        <View style={styles.searchRow}>
          <View style={[styles.searchBox, { backgroundColor: c.cardDark, borderColor: c.border }]}>
            <TextInput
              ref={searchRef}
              style={[styles.searchInput, { color: c.text }]}
              placeholder="Search businesses…"
              placeholderTextColor={c.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
          <TouchableOpacity
            style={[styles.avatar, { backgroundColor: c.cardDark }]}
            onPress={() => {
              showPanel('my-profile');
              setTimeout(() => TrueSheet.resize(SHEET_NAME, 1), 350);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.avatarInitials, { color: c.text }]}>{initials || '❋'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Location strip */}
      {isOrderableLocation && (
        <TouchableOpacity
          style={styles.strip}
          activeOpacity={0.6}
          onPress={() => showPanel('verifyNFC')}
        >
          <Text style={[styles.stripBrand, { color: c.text }]}>
            {`box fraise × ${activeLocation!.name.toLowerCase()}`}
          </Text>
        </TouchableOpacity>
      )}

      {!isCollapsed && !isOrderableLocation && (
        <View style={styles.discoverContainer}>
          {/* Ambient header */}
          <View style={styles.ambientBlock}>
            <Text style={[styles.ambientDate, { color: c.text }]}>
              {new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).toLowerCase()}
            </Text>
            <Text style={[styles.ambientSeason, { color: c.muted }]}>{season}</Text>
            <Text style={[styles.ambientStat, { color: c.muted }]}>
              {businesses.filter(b => b.type === 'partner').length} locations · edmonton
            </Text>
            {nearestCollection && (
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleLocationSelect(nearestCollection); }}
                activeOpacity={0.7}
                style={{ marginTop: 12 }}
              >
                <Text style={[styles.nearestHint, { color: c.text }]}>
                  {nearestCollection.name.toLowerCase()}{formatDist(nearestCollection) ? `  ·  ${formatDist(nearestCollection)}` : ''}  →
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {searchQuery.trim() !== '' ? (
            <ScrollView
              style={styles.scroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {searchResults.length === 0 ? (
                <Text style={[styles.nothingText, { color: c.muted, paddingHorizontal: SPACING.md, paddingTop: SPACING.md }]}>nothing matched — try a neighbourhood or name</Text>
              ) : searchResults.map(b => {
                const dist = formatDist(b);
                const meta = [(b as any).neighbourhood ?? (b as any).city, b.hours].filter(Boolean).join('  ·  ');
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.locCard, { borderBottomColor: c.border }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleLocationSelect(b); }}
                    activeOpacity={0.75}
                  >
                    <View style={styles.locCardBody}>
                      <Text style={[styles.locCardName, { color: c.text }]}>{b.name}</Text>
                      {!!meta && <Text style={[styles.locCardMeta, { color: c.muted }]}>{meta}</Text>}
                      {!!dist && <Text style={[styles.locCardDist, { color: c.muted }]}>{dist}</Text>}
                    </View>
                    <Text style={[styles.locCardArrow, { color: c.muted }]}>→</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={styles.supportBtn}
                onPress={() => showPanel('donate')}
                activeOpacity={0.6}
              >
                <Text style={[styles.supportText, { color: c.muted }]}>Support Box Fraise →</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <TouchableOpacity
              style={styles.supportBtn}
              onPress={() => showPanel('donate')}
              activeOpacity={0.6}
            >
              <Text style={[styles.supportText, { color: c.muted }]}>Support Box Fraise →</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!isCollapsed && isOrderableLocation && (
        <>
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
          >
            {/* Location meta */}
            <View style={styles.locationMeta}>
              <Text style={[styles.locationMetaText, { color: c.muted }]} numberOfLines={1}>
                {[
                  activeLocation!.type === 'popup' ? 'popup' : null,
                  activeLocation!.address ?? (activeLocation as any).neighbourhood ?? null,
                  activeLocation!.type === 'popup' && activeLocation!.launched_at
                    ? ((activeLocation as any).hours ?? new Date(activeLocation!.launched_at).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }))
                    : new Date().toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }),
                ].filter(Boolean).join('  ·  ')}
              </Text>
              {order.order_id && order.location_id === activeLocation!.id && (
                <Text style={[styles.orderPlaced, { color: c.accent }]}>order placed</Text>
              )}
            </View>

            {!!(activeLocation as any).description && (
              <View style={styles.identityBlock}>
                <Text style={[styles.description, { color: c.muted }]}>{(activeLocation as any).description}</Text>
              </View>
            )}

            {otherLocations.length > 0 && (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={otherLocations}
                keyExtractor={b => String(b.id)}
                contentContainerStyle={styles.switcherRow}
                renderItem={({ item: b }) => (
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveLocation(b); setOrder({ location_id: b.id, location_name: b.name }); }}
                    activeOpacity={0.7}
                    style={[styles.switcherChip, { borderColor: c.border }]}
                  >
                    <Text style={[styles.switcherChipText, { color: c.muted }]}>{b.name}</Text>
                  </TouchableOpacity>
                )}
              />
            )}

            <View style={[styles.divider, { backgroundColor: c.border }]} />

            {/* Not signed in */}
            {!userDbId && (
              <Text style={[styles.signInHint, { color: c.muted }]}>sign in via your profile to place an order</Text>
            )}

            {/* Confirmed state */}
            {orderStep === 'confirmed' && confirmedOrder && (
              <View style={styles.orderBlock}>
                <Text style={[styles.confirmedTitle, { color: c.text }]}>
                  {confirmedOrder.status === 'queued' ? "you're in the queue." : 'order placed.'}
                </Text>
                {confirmedOrder.queued_boxes != null && (
                  <View style={styles.batchBarWrap}>
                    <View style={[styles.batchBarTrack, { backgroundColor: c.border }]}>
                      <View style={[styles.batchBarFill, { backgroundColor: c.accent, width: `${Math.min(100, (confirmedOrder.queued_boxes / confirmedOrder.min_quantity) * 100)}%` }]} />
                    </View>
                    <Text style={[styles.batchBarLabel, { color: c.muted }]}>
                      {confirmedOrder.status === 'queued'
                        ? `${confirmedOrder.min_quantity - confirmedOrder.queued_boxes} more to fill`
                        : 'batch filled · being prepared'}
                    </Text>
                    {confirmedOrder.status === 'queued' && (
                      <Text style={[styles.batchNote, { color: c.muted }]}>card held — charged when batch fills</Text>
                    )}
                  </View>
                )}
                <TouchableOpacity onPress={resetOrder} activeOpacity={0.7} style={{ paddingTop: 8 }}>
                  <Text style={[styles.stepLabel, { color: c.accent }]}>new order →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Order flow */}
            {orderStep !== 'confirmed' && (
              <View style={styles.orderBlock}>

                {/* Variety */}
                {loading ? (
                  <ActivityIndicator color={c.accent} style={{ marginVertical: 32 }} />
                ) : fetchError ? (
                  <TouchableOpacity onPress={loadVarieties} activeOpacity={0.7}>
                    <Text style={[styles.nothingText, { color: c.muted }]}>could not load — tap to retry</Text>
                  </TouchableOpacity>
                ) : bizVarieties.length === 0 ? (
                  <Text style={[styles.nothingText, { color: c.muted }]}>nothing ready today</Text>
                ) : stepDone('variety') ? (
                  <TouchableOpacity onPress={() => { setOrderStep('variety'); setInlineOrder(p => ({ ...p, chocolate: null, chocolate_name: null, finish: null, finish_name: null })); }} activeOpacity={0.7}>
                    <Text style={[styles.stepSummary, { color: c.text }]}>{inlineOrder.variety_name}</Text>
                  </TouchableOpacity>
                ) : (
                  bizVarieties.map((v: Variety, idx: number) => {
                    const freshColor = (v as any).freshnessColor ?? c.accent;
                    return (
                      <React.Fragment key={v.id}>
                        {idx > 0 && <View style={[styles.rowDivider, { backgroundColor: c.border }]} />}
                        <TouchableOpacity
                          style={styles.varietyBlock}
                          onPress={() => {
                            if (!userDbId) { Alert.alert('Sign in required', 'Sign in via your profile to place an order.'); return; }
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setInlineOrder(p => ({ ...p, variety_id: v.id, variety_name: v.name, price_cents: v.price_cents }));
                            setOrderStep('chocolate');
                            setTimeout(() => TrueSheet.resize(SHEET_NAME, 1), 200);
                            scrollToBottom();
                          }}
                          activeOpacity={0.8}
                        >
                          <View style={styles.varietyTopRow}>
                            <Text style={[styles.varietyName, { color: c.text }]}>{v.name}</Text>
                            <Text style={[styles.varietyPrice, { color: c.text }]}>CA${(v.price_cents / 100).toFixed(0)}</Text>
                          </View>
                          <View style={styles.provenanceRow}>
                            {v.farm && <Text style={[styles.farm, { color: c.muted }]}>{v.farm}</Text>}
                            {v.farm && v.harvestDate && <Text style={[styles.provenanceDot, { color: c.border }]}>·</Text>}
                            {v.harvestDate && <Text style={[styles.harvest, { color: c.muted }]}>récolte {formatHarvestDate(v.harvestDate)}</Text>}
                            {(v.farm || v.harvestDate) && <Text style={[styles.provenanceDot, { color: c.border }]}>·</Text>}
                            <View style={[styles.freshDot, { backgroundColor: freshColor }]} />
                          </View>
                          {v.description && <Text style={[styles.varietyDesc, { color: c.muted }]}>{v.description}</Text>}
                          <View style={styles.batchBarWrap}>
                            <View style={[styles.batchBarTrack, { backgroundColor: c.border }]}>
                              <View style={[styles.batchBarFill, { backgroundColor: c.accent, width: `${Math.min(100, ((batchStatus[v.id]?.queued_boxes ?? 0) / (batchStatus[v.id]?.min_quantity ?? 4)) * 100)}%` }]} />
                            </View>
                            <Text style={[styles.batchBarLabel, { color: c.muted }]}>
                              {batchStatus[v.id]?.queued_boxes ?? 0} of {batchStatus[v.id]?.min_quantity ?? 4} queued
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </React.Fragment>
                    );
                  })
                )}

                {/* Chocolate */}
                {(orderStep === 'chocolate' || stepDone('chocolate')) && (
                  <>
                    <View style={[styles.rowDivider, { backgroundColor: c.border }]} />
                    {stepDone('chocolate') ? (
                      <TouchableOpacity onPress={() => { setOrderStep('chocolate'); setInlineOrder(p => ({ ...p, finish: null, finish_name: null })); }} activeOpacity={0.7}>
                        <Text style={[styles.stepSummaryMuted, { color: c.muted }]}>{inlineOrder.chocolate_name}</Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <Text style={[styles.stepLabel, { color: c.muted }]}>chocolate</Text>
                        {CHOCOLATES.map((choc, i) => (
                          <React.Fragment key={choc.id}>
                            {i > 0 && <View style={[styles.rowDivider, { backgroundColor: c.border }]} />}
                            <TouchableOpacity
                              style={styles.optionRow}
                              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setInlineOrder(p => ({ ...p, chocolate: choc.id, chocolate_name: choc.name })); setOrderStep('finish'); scrollToBottom(); }}
                              activeOpacity={0.7}
                            >
                              <View style={[styles.swatch, { backgroundColor: (choc as any).swatchColor }]} />
                              <Text style={[styles.optionName, { color: c.text }]}>{choc.name}</Text>
                            </TouchableOpacity>
                          </React.Fragment>
                        ))}
                      </>
                    )}
                  </>
                )}

                {/* Finish */}
                {(orderStep === 'finish' || stepDone('finish')) && (
                  <>
                    <View style={[styles.rowDivider, { backgroundColor: c.border }]} />
                    {stepDone('finish') ? (
                      <TouchableOpacity onPress={() => setOrderStep('finish')} activeOpacity={0.7}>
                        <Text style={[styles.stepSummaryMuted, { color: c.muted }]}>{inlineOrder.finish_name}</Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <Text style={[styles.stepLabel, { color: c.muted }]}>finish</Text>
                        {FINISHES.map((fin, i) => (
                          <React.Fragment key={fin.id}>
                            {i > 0 && <View style={[styles.rowDivider, { backgroundColor: c.border }]} />}
                            <TouchableOpacity
                              style={styles.optionRow}
                              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setInlineOrder(p => ({ ...p, finish: fin.id, finish_name: fin.name })); setOrderStep('quantity'); scrollToBottom(); }}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.optionName, { color: c.text }]}>{fin.name}</Text>
                              {(fin as any).description && <Text style={[styles.optionMeta, { color: c.muted }]}>{(fin as any).description}</Text>}
                            </TouchableOpacity>
                          </React.Fragment>
                        ))}
                      </>
                    )}
                  </>
                )}

                {/* Quantity */}
                {(orderStep === 'quantity' || stepDone('quantity')) && (
                  <>
                    <View style={[styles.rowDivider, { backgroundColor: c.border }]} />
                    {stepDone('quantity') ? (
                      <TouchableOpacity onPress={() => setOrderStep('quantity')} activeOpacity={0.7}>
                        <Text style={[styles.stepSummaryMuted, { color: c.muted }]}>×{inlineOrder.quantity}</Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <Text style={[styles.stepLabel, { color: c.muted }]}>boxes</Text>
                        <View style={styles.qtyRow}>
                          <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setInlineOrder(p => ({ ...p, quantity: Math.max(1, p.quantity - 1) })); }} activeOpacity={0.7} style={styles.qtyBtn}>
                            <Text style={[styles.qtyBtnText, { color: c.accent }]}>−</Text>
                          </TouchableOpacity>
                          <Text style={[styles.qtyValue, { color: c.text }]}>{inlineOrder.quantity}</Text>
                          <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setInlineOrder(p => ({ ...p, quantity: Math.min(12, p.quantity + 1) })); }} activeOpacity={0.7} style={styles.qtyBtn}>
                            <Text style={[styles.qtyBtnText, { color: c.accent }]}>+</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setOrderStep('review'); scrollToBottom(); }} activeOpacity={0.7} style={styles.qtyConfirm}>
                            <Text style={[styles.stepLabel, { color: c.accent }]}>CONFIRM</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </>
                )}

                {/* Review */}
                {orderStep === 'review' && (
                  <>
                    <View style={[styles.rowDivider, { backgroundColor: c.border }]} />
                    <View style={styles.reviewBlock}>
                      <Text style={[styles.reviewVariety, { color: c.text }]}>{inlineOrder.variety_name}</Text>
                      <Text style={[styles.stepSummaryMuted, { color: c.muted }]}>
                        {inlineOrder.chocolate_name}{'  ·  '}{inlineOrder.finish_name}{'  ·  '}×{inlineOrder.quantity}
                      </Text>
                      <Text style={[styles.stepSummaryMuted, { color: c.muted }]}>{activeLocation!.name}</Text>
                      <Text style={[styles.reviewTotal, { color: c.text }]}>CA${(totalCents / 100).toFixed(2)}</Text>
                      <Text style={[styles.batchNote, { color: c.muted }]}>held until batch fills</Text>
                    </View>
                  </>
                )}

                {orderInProgress && orderStep !== 'review' && (
                  <TouchableOpacity onPress={resetOrder} activeOpacity={0.6} style={{ paddingTop: SPACING.md }}>
                    <Text style={[styles.cancelText, { color: c.muted }]}>cancel</Text>
                  </TouchableOpacity>
                )}

              </View>
            )}

            <View style={{ height: orderStep === 'review' ? 100 : 48 }} />
          </ScrollView>

          {/* Sticky pay bar */}
          {orderStep === 'review' && (
            <View style={[styles.reviewBar, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
              {userDbId && adBalanceCents >= totalCents && (
                <TouchableOpacity
                  style={[styles.reviewBarBtn, { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }, paying && { opacity: 0.5 }]}
                  onPress={handlePayWithBalance}
                  disabled={paying}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.reviewBarBtnText, { color: c.text }]}>
                    Pay with balance  CA${(totalCents / 100).toFixed(2)}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.reviewBarBtn, { backgroundColor: c.accent }, paying && { opacity: 0.5 }]}
                onPress={handlePay}
                disabled={paying}
                activeOpacity={0.8}
              >
                {paying
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={[styles.reviewBarBtnText, { color: '#fff' }]}>Pay →</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  strip: { alignItems: 'center', paddingTop: 28, paddingBottom: 20 },
  stripBrand: { fontSize: 13, fontFamily: fonts.playfair, letterSpacing: 0.3 },
  stripSpacer: { height: 16 },
  scroll: { flex: 1 },
  discoverContainer: { flex: 1 },
  supportBtn: { alignSelf: 'center', paddingVertical: 16 },
  supportText: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 1 },
  ambientBlock: { paddingHorizontal: SPACING.md, paddingTop: SPACING.lg, paddingBottom: SPACING.md, gap: 4 },
  ambientDate: { fontSize: 32, fontFamily: fonts.playfair },
  ambientSeason: { fontSize: 13, fontFamily: fonts.playfair, fontStyle: 'italic' },
  ambientStat: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1, marginTop: 6 },
  nearestHint: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },

  // Discover
  searchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: SPACING.sm, gap: 10 },
  searchBox: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { fontSize: 14, fontFamily: fonts.dmSans },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 13, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  locCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth },
  locCardBody: { flex: 1, gap: 3 },
  locCardName: { fontSize: 16, fontFamily: fonts.playfair },
  locCardMeta: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.4 },
  locCardDist: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.4 },
  locCardArrow: { fontSize: 16, fontFamily: fonts.dmSans, paddingLeft: SPACING.sm },

  // Location view
  locationMeta: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: 4, gap: 4 },
  locationMetaText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  orderPlaced: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  identityBlock: { paddingHorizontal: SPACING.md, paddingTop: 6, paddingBottom: SPACING.md },
  description: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20, fontStyle: 'italic' },
  switcherRow: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: 8, flexDirection: 'row' },
  switcherChip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  switcherChipText: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md },
  signInHint: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5, textAlign: 'center', paddingVertical: SPACING.md },

  // Order flow
  orderBlock: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, gap: 0 },
  stepLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, paddingVertical: 10 },
  stepSummary: { fontSize: 28, fontFamily: fonts.playfair, paddingVertical: 8 },
  stepSummaryMuted: { fontSize: 12, fontFamily: fonts.dmMono, paddingVertical: 4 },
  rowDivider: { height: StyleSheet.hairlineWidth, marginVertical: SPACING.sm },
  optionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  optionName: { fontSize: 15, fontFamily: fonts.playfair, flex: 1 },
  optionMeta: { fontSize: 11, fontFamily: fonts.dmSans },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 16 },
  qtyBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontSize: 32, fontFamily: fonts.playfair },
  qtyValue: { fontSize: 32, fontFamily: fonts.playfair, minWidth: 40, textAlign: 'center' },
  qtyConfirm: { marginLeft: 'auto' as any },
  reviewBlock: { paddingTop: 8, gap: 6 },
  reviewVariety: { fontSize: 28, fontFamily: fonts.playfair },
  reviewTotal: { fontSize: 48, fontFamily: fonts.playfair, marginTop: 4 },
  batchNote: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.3, marginTop: 4 },
  confirmedTitle: { fontSize: 32, fontFamily: fonts.playfair, paddingTop: 8 },
  cancelText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },

  // Variety cards
  varietyBlock: { gap: 6, paddingVertical: SPACING.sm },
  varietyTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  varietyName: { fontSize: 32, fontFamily: fonts.playfair, flex: 1 },
  varietyPrice: { fontSize: 14, fontFamily: fonts.dmMono },
  provenanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  farm: { fontSize: 11, fontFamily: fonts.dmMono },
  harvest: { fontSize: 11, fontFamily: fonts.dmMono },
  provenanceDot: { fontSize: 10, fontFamily: fonts.dmMono },
  freshDot: { width: 6, height: 6, borderRadius: 3 },
  varietyDesc: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20, fontStyle: 'italic' },
  batchBarWrap: { gap: 3, marginTop: 4 },
  batchBarTrack: { height: 2, borderRadius: 1, overflow: 'hidden' },
  batchBarFill: { height: 2, borderRadius: 1 },
  batchBarLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },

  // Pay bar
  reviewBar: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, gap: SPACING.sm },
  reviewBarBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  reviewBarBtnText: { fontSize: 20, fontFamily: fonts.dmMono, letterSpacing: 0.5 },

  nothingText: { fontSize: 13, fontFamily: fonts.dmSans, fontStyle: 'italic', paddingVertical: 8 },
});
