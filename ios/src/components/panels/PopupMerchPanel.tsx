import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useStripe } from '@stripe/stripe-react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import {
  PopupMerchItem, PopupMerchOrder,
  fetchPopupMerch, fetchPopupMerchOrders,
  createPopupMerchOrder, searchUsers,
} from '../../lib/api';

type DestinationMode = 'keep' | 'gift' | 'donate';

export default function PopupMerchPanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const popupId: number = panelData?.popupId;
  const popupName: string = panelData?.popupName ?? 'popup';

  const [items, setItems] = useState<PopupMerchItem[]>([]);
  const [orders, setOrders] = useState<{ sent: PopupMerchOrder[]; received: PopupMerchOrder[] }>({ sent: [], received: [] });
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<PopupMerchItem | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [mode, setMode] = useState<DestinationMode>('keep');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosenRecipient, setChosenRecipient] = useState<{ id: number; name: string } | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    if (!popupId) return;
    try {
      const [itemsData, ordersData] = await Promise.all([
        fetchPopupMerch(popupId),
        fetchPopupMerchOrders(popupId),
      ]);
      setItems(itemsData);
      setOrders(ordersData);
    } catch (err: any) {
      Alert.alert('Could not load', err.message ?? 'Try again.');
    }
    setLoading(false);
  }, [popupId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showSearch) return;
    const q = searchQuery.trim();
    if (!q || q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { setSearchResults(await searchUsers(q)); }
      catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, showSearch]);

  const reset = () => {
    setSelected(null);
    setSelectedSize(null);
    setMode('keep');
    setChosenRecipient(null);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleBuy = async () => {
    if (!selected || !popupId) return;
    if (selected.sizes.length > 0 && !selectedSize) {
      Alert.alert('Select a size'); return;
    }
    if (mode === 'gift' && !chosenRecipient) {
      Alert.alert('Choose who to gift it to'); return;
    }

    setPaying(true);
    try {
      const body: Parameters<typeof createPopupMerchOrder>[1] = {
        item_id: selected.id,
        size: selectedSize ?? undefined,
      };
      if (mode === 'donate') body.donate = true;
      else if (mode === 'gift' && chosenRecipient) body.recipient_user_id = chosenRecipient.id;

      const { client_secret } = await createPopupMerchOrder(popupId, body);

      const { error: initErr } = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: 'Maison Fraise',
        style: 'automatic',
      });
      if (initErr) { Alert.alert('Payment error', initErr.message); setPaying(false); return; }

      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) {
        if (presentErr.code !== 'Canceled') Alert.alert('Payment failed', presentErr.message);
        setPaying(false);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
      await load();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not complete purchase.');
    }
    setPaying(false);
  };

  const priceFmt = (cents: number) => `CA$${(cents / 100).toFixed(2)}`;

  if (!popupId) return null;

  return (
    <ScrollView style={[styles.container, { backgroundColor: c.panelBg }]} showsVerticalScrollIndicator={false}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{popupName}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.muted} style={{ marginTop: SPACING.xl }} />
      ) : (
        <>
          {/* ── Items ── */}
          {items.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>MERCH</Text>
              {items.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.itemRow, { borderBottomColor: c.border }, selected?.id === item.id && { backgroundColor: c.card }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelected(selected?.id === item.id ? null : item);
                    setSelectedSize(null);
                    setMode('keep');
                    setChosenRecipient(null);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: c.text }]}>{item.name}</Text>
                    {item.description && (
                      <Text style={[styles.itemDesc, { color: c.muted }]}>{item.description}</Text>
                    )}
                    {item.stock_remaining <= 5 && (
                      <Text style={[styles.itemStock, { color: '#FF3B30' }]}>{item.stock_remaining} left</Text>
                    )}
                  </View>
                  <Text style={[styles.itemPrice, { color: c.text }]}>{priceFmt(item.price_cents)}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* ── Compose ── */}
          {selected && (
            <View style={[styles.compose, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.composeTitle, { color: c.text }]}>{selected.name}</Text>

              {/* Size picker */}
              {selected.sizes.length > 0 && (
                <View style={styles.sizeRow}>
                  {selected.sizes.map(s => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.sizeChip, { borderColor: c.border }, selectedSize === s && { backgroundColor: c.accent, borderColor: c.accent }]}
                      onPress={() => setSelectedSize(s)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.sizeChipText, { color: selectedSize === s ? c.panelBg : c.text }]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Destination */}
              <View style={styles.modeRow}>
                {(['keep', 'gift', 'donate'] as DestinationMode[]).map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.modeChip, { borderColor: c.border }, mode === m && { backgroundColor: m === 'donate' ? '#C0392B' : c.accent, borderColor: 'transparent' }]}
                    onPress={() => { setMode(m); setChosenRecipient(null); setShowSearch(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modeChipText, { color: mode === m ? c.panelBg : c.muted }]}>
                      {m === 'keep' ? 'keep' : m === 'gift' ? 'gift' : 'donate'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {mode === 'donate' && (
                <Text style={[styles.donateHint, { color: c.muted }]}>
                  Goes to someone who needs it. Shows on your profile.
                </Text>
              )}

              {/* Gift recipient search */}
              {mode === 'gift' && !chosenRecipient && (
                <>
                  {!showSearch ? (
                    <TouchableOpacity onPress={() => setShowSearch(true)} activeOpacity={0.7}>
                      <Text style={[styles.searchLink, { color: c.muted }]}>+ choose who to gift</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TextInput
                        style={[styles.searchInput, { color: c.text, backgroundColor: c.panelBg, borderColor: c.border }]}
                        placeholder="search people..."
                        placeholderTextColor={c.muted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoFocus
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {searching && <ActivityIndicator color={c.muted} />}
                      {searchResults.map(u => (
                        <TouchableOpacity
                          key={u.id}
                          style={[styles.userRow, { borderBottomColor: c.border }]}
                          onPress={() => { setChosenRecipient({ id: u.id, name: u.display_name ?? u.user_code ?? 'user' }); setShowSearch(false); }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.userName, { color: c.text }]}>{u.display_name ?? u.user_code ?? 'user'}</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                </>
              )}
              {mode === 'gift' && chosenRecipient && (
                <View style={styles.chosenRow}>
                  <Text style={[styles.chosenName, { color: c.text }]}>→ {chosenRecipient.name}</Text>
                  <TouchableOpacity onPress={() => setChosenRecipient(null)}>
                    <Text style={[styles.clearBtn, { color: c.muted }]}>×</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={[styles.buyBtn, { backgroundColor: mode === 'donate' ? '#C0392B' : c.accent }, paying && { opacity: 0.5 }]}
                onPress={handleBuy}
                disabled={paying}
                activeOpacity={0.8}
              >
                {paying
                  ? <ActivityIndicator color={c.panelBg} />
                  : <Text style={[styles.buyBtnText, { color: c.panelBg }]}>
                      {mode === 'donate' ? `donate ${priceFmt(selected.price_cents)}` : `buy ${priceFmt(selected.price_cents)}`}
                    </Text>
                }
              </TouchableOpacity>
            </View>
          )}

          {/* ── Sent ── */}
          {orders.sent.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>SENT</Text>
              {orders.sent.map(o => (
                <View key={o.id} style={[styles.orderRow, { borderBottomColor: c.border }]}>
                  <View style={styles.orderInfo}>
                    <Text style={[styles.orderName, { color: c.text }]}>{o.item_name}</Text>
                    <Text style={[styles.orderMeta, { color: c.muted }]}>
                      {o.donated
                        ? 'donated'
                        : o.recipient_user_id
                          ? `gifted to ${o.recipient_name ?? o.recipient_code ?? 'user'}`
                          : 'kept'}
                      {o.size ? ` · ${o.size}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.orderPrice, { color: c.muted }]}>{priceFmt(o.total_cents)}</Text>
                </View>
              ))}
            </>
          )}

          {/* ── Received ── */}
          {orders.received.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>RECEIVED</Text>
              {orders.received.map(o => (
                <View key={o.id} style={[styles.orderRow, { borderBottomColor: c.border }]}>
                  <View style={styles.orderInfo}>
                    <Text style={[styles.orderName, { color: c.text }]}>{o.item_name}</Text>
                    <Text style={[styles.orderMeta, { color: c.muted }]}>
                      from {o.buyer_name ?? o.buyer_code ?? 'someone'}{o.size ? ` · ${o.size}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {items.length === 0 && (
            <Text style={[styles.empty, { color: c.muted }]}>no merch yet</Text>
          )}

          <View style={{ height: SPACING.xl * 2 }} />
        </>
      )}
    </ScrollView>
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
  backBtn: { width: 40, paddingVertical: 4 },
  backText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, fontSize: 18, fontFamily: fonts.playfair, textAlign: 'center' },
  headerSpacer: { width: 40 },
  sectionLabel: {
    fontSize: 10,
    fontFamily: fonts.dmMono,
    letterSpacing: 1.5,
    paddingHorizontal: SPACING.md,
    paddingTop: 16,
    paddingBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  itemInfo: { flex: 1, gap: 3 },
  itemName: { fontSize: 16, fontFamily: fonts.playfair },
  itemDesc: { fontSize: 12, fontFamily: fonts.dmSans },
  itemStock: { fontSize: 11, fontFamily: fonts.dmSans },
  itemPrice: { fontSize: 14, fontFamily: fonts.dmMono },
  compose: {
    margin: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: SPACING.md,
    gap: 12,
  },
  composeTitle: { fontSize: 15, fontFamily: fonts.dmSans, fontWeight: '600' },
  sizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sizeChipText: { fontSize: 12, fontFamily: fonts.dmMono },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modeChipText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  donateHint: { fontSize: 12, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  searchLink: { fontSize: 12, fontFamily: fonts.dmSans },
  searchInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: fonts.dmSans,
  },
  userRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  userName: { fontSize: 14, fontFamily: fonts.dmSans },
  chosenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chosenName: { fontSize: 13, fontFamily: fonts.dmSans },
  clearBtn: { fontSize: 18, lineHeight: 22 },
  buyBtn: { height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  buyBtnText: { fontSize: 14, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  orderInfo: { flex: 1, gap: 3 },
  orderName: { fontSize: 15, fontFamily: fonts.dmSans },
  orderMeta: { fontSize: 11, fontFamily: fonts.dmSans },
  orderPrice: { fontSize: 11, fontFamily: fonts.dmMono },
  empty: { fontSize: 13, fontFamily: fonts.dmSans, paddingHorizontal: SPACING.md, paddingTop: SPACING.lg, fontStyle: 'italic' },
});
