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
  PopupMenuItem, PopupFoodOrder, PopupFoodOrdersResponse,
  fetchPopupFoodMenu, fetchPopupFoodOrders,
  createPopupFoodOrder, claimPopupFoodOrder,
  searchUsers,
} from '../../lib/api';

type RecipientMode = 'self' | 'anyone';

export default function PopupFoodPanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const popupId: number = panelData?.popupId;
  const popupName: string = panelData?.popupName ?? 'popup';

  const [menu, setMenu] = useState<PopupMenuItem[]>([]);
  const [data, setData] = useState<PopupFoodOrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Compose state
  const [selected, setSelected] = useState<PopupMenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('self');
  const [note, setNote] = useState('');
  const [paying, setPaying] = useState(false);

  // For buying for a specific person
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosenRecipient, setChosenRecipient] = useState<{ id: number; name: string } | null>(null);
  const [showRecipientSearch, setShowRecipientSearch] = useState(false);

  const load = useCallback(async () => {
    if (!popupId) return;
    try {
      const [menuData, ordersData] = await Promise.all([
        fetchPopupFoodMenu(popupId),
        fetchPopupFoodOrders(popupId),
      ]);
      setMenu(menuData);
      setData(ordersData);
    } catch (err: any) {
      Alert.alert('Could not load', err.message ?? 'Try again.');
    }
    setLoading(false);
  }, [popupId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showRecipientSearch) return;
    const q = searchQuery.trim();
    if (!q || q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { setSearchResults(await searchUsers(q)); }
      catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, showRecipientSearch]);

  const resetCompose = () => {
    setSelected(null);
    setQuantity(1);
    setRecipientMode('self');
    setNote('');
    setChosenRecipient(null);
    setShowRecipientSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleBuy = async () => {
    if (!selected || !popupId) return;
    setPaying(true);
    try {
      // qty - 1 extras go to open claim, 1 goes to self (or chosen recipient)
      const selfQty = 1;
      const extraQty = quantity - 1;

      // Buy for self (or chosen recipient)
      const selfBody: Parameters<typeof createPopupFoodOrder>[1] = {
        menu_item_id: selected.id,
        quantity: selfQty,
        note: note.trim() || undefined,
        ...(chosenRecipient ? { recipient_user_id: chosenRecipient.id } : {}),
      };
      const { client_secret } = await createPopupFoodOrder(popupId, selfBody);

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

      // Buy extras as open claims — only after primary payment succeeds
      for (let i = 0; i < extraQty; i++) {
        try {
          const { client_secret: cs } = await createPopupFoodOrder(popupId, {
            menu_item_id: selected.id,
            quantity: 1,
            for_anyone: true,
            note: note.trim() || undefined,
          });
          const { error: ie } = await initPaymentSheet({ paymentIntentClientSecret: cs, merchantDisplayName: 'Maison Fraise', style: 'automatic' });
          if (ie) break;
          const { error: pe } = await presentPaymentSheet();
          if (pe) break;
        } catch { break; }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetCompose();
      await load();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not complete purchase.');
    }
    setPaying(false);
  };

  const handleClaim = async (order: PopupFoodOrder) => {
    if (!popupId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await claimPopupFoodOrder(popupId, order.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not claim.');
    }
  };

  const priceFmt = (cents: number) => `CA$${(cents / 100).toFixed(2)}`;

  const confirmed = data?.status === 'confirmed';
  const paid_count = data?.paid_count ?? 0;
  const threshold = data?.min_orders_to_confirm ?? null;
  const progressPct = threshold ? Math.min(1, paid_count / threshold) : null;

  const dateStr = confirmed && data?.starts_at
    ? new Date(data.starts_at).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  const openClaims = data?.claimable ?? [];
  const myOrders = data?.mine ?? [];
  const myContributions = myOrders.filter(o => o.buyer_user_id !== o.recipient_user_id && o.recipient_user_id !== null).length;

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
          {/* ── Status block ── */}
          <View style={[styles.statusBlock, { borderBottomColor: c.border }]}>
            {confirmed ? (
              <>
                <Text style={[styles.statusLabel, { color: c.accent }]}>confirmed</Text>
                {dateStr && <Text style={[styles.statusDate, { color: c.text }]}>{dateStr}</Text>}
              </>
            ) : (
              <>
                <Text style={[styles.statusLabel, { color: c.muted }]}>date TBD</Text>
                <Text style={[styles.statusHint, { color: c.muted }]}>
                  {threshold
                    ? `${paid_count} of ${threshold} orders needed to confirm`
                    : `${paid_count} order${paid_count !== 1 ? 's' : ''} in`}
                </Text>
                {progressPct !== null && (
                  <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
                    <View style={[styles.progressFill, { backgroundColor: c.accent, width: `${Math.round(progressPct * 100)}%` as any }]} />
                  </View>
                )}
              </>
            )}
          </View>

          {/* ── Menu ── */}
          {menu.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>MENU</Text>
              {menu.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.menuRow, { borderBottomColor: c.border }, selected?.id === item.id && { backgroundColor: c.card }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelected(selected?.id === item.id ? null : item);
                    setQuantity(1);
                    setRecipientMode('self');
                    setChosenRecipient(null);
                    setNote('');
                  }}
                  activeOpacity={0.75}
                >
                  <View style={styles.menuInfo}>
                    <Text style={[styles.menuName, { color: c.text }]}>{item.name}</Text>
                    {item.description && (
                      <Text style={[styles.menuDesc, { color: c.muted }]}>{item.description}</Text>
                    )}
                  </View>
                  {item.price_cents != null && (
                    <Text style={[styles.menuPrice, { color: c.text }]}>{priceFmt(item.price_cents)}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* ── Compose ── */}
          {selected && (
            <View style={[styles.compose, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.composeTitle, { color: c.text }]}>{selected.name}</Text>

              {/* Quantity */}
              <View style={styles.qtyRow}>
                <Text style={[styles.qtyLabel, { color: c.muted }]}>quantity</Text>
                <View style={styles.qtyControls}>
                  <TouchableOpacity onPress={() => setQuantity(q => Math.max(1, q - 1))} style={styles.qtyBtn} activeOpacity={0.7}>
                    <Text style={[styles.qtyBtnText, { color: c.text }]}>−</Text>
                  </TouchableOpacity>
                  <Text style={[styles.qtyValue, { color: c.text }]}>{quantity}</Text>
                  <TouchableOpacity onPress={() => setQuantity(q => Math.min(10, q + 1))} style={styles.qtyBtn} activeOpacity={0.7}>
                    <Text style={[styles.qtyBtnText, { color: c.text }]}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {quantity > 1 && (
                <Text style={[styles.extraHint, { color: c.muted }]}>
                  1 for you · {quantity - 1} open for anyone to claim
                </Text>
              )}

              {/* For someone specific */}
              {!showRecipientSearch && !chosenRecipient && (
                <TouchableOpacity onPress={() => setShowRecipientSearch(true)} activeOpacity={0.7}>
                  <Text style={[styles.forSomeoneLink, { color: c.muted }]}>+ buy for someone specific</Text>
                </TouchableOpacity>
              )}
              {showRecipientSearch && !chosenRecipient && (
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
                      onPress={() => { setChosenRecipient({ id: u.id, name: u.display_name ?? u.user_code ?? 'user' }); setShowRecipientSearch(false); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.userName, { color: c.text }]}>{u.display_name ?? u.user_code ?? 'user'}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {chosenRecipient && (
                <View style={styles.chosenRow}>
                  <Text style={[styles.chosenName, { color: c.text }]}>for {chosenRecipient.name}</Text>
                  <TouchableOpacity onPress={() => setChosenRecipient(null)}>
                    <Text style={[styles.clearBtn, { color: c.muted }]}>×</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Note */}
              <TextInput
                style={[styles.noteInput, { color: c.text, backgroundColor: c.panelBg, borderColor: c.border }]}
                placeholder="note (optional)"
                placeholderTextColor={c.muted}
                value={note}
                onChangeText={setNote}
                maxLength={120}
              />

              {selected.price_cents != null && (
                <Text style={[styles.totalLine, { color: c.muted }]}>
                  total {priceFmt(selected.price_cents * quantity)}
                </Text>
              )}

              <Text style={[styles.refundNote, { color: c.muted }]}>
                charged now · full refund if the event doesn't confirm
              </Text>

              <TouchableOpacity
                style={[styles.buyBtn, { backgroundColor: c.accent }, paying && { opacity: 0.5 }]}
                onPress={handleBuy}
                disabled={paying}
                activeOpacity={0.8}
              >
                {paying
                  ? <ActivityIndicator color={c.panelBg} />
                  : <Text style={[styles.buyBtnText, { color: c.panelBg }]}>prepay</Text>
                }
              </TouchableOpacity>
            </View>
          )}

          {/* ── Open claims ── */}
          {openClaims.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>OPEN FOR ANYONE</Text>
              {openClaims.map(o => (
                <View key={o.id} style={[styles.orderRow, { borderBottomColor: c.border }]}>
                  <View style={styles.orderInfo}>
                    <Text style={[styles.orderName, { color: c.text }]}>{o.item_name}</Text>
                    {o.note && <Text style={[styles.orderNote, { color: c.muted }]}>{o.note}</Text>}
                  </View>
                  <TouchableOpacity
                    style={[styles.claimBtn, { borderColor: c.accent }]}
                    onPress={() => handleClaim(o)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.claimBtnText, { color: c.accent }]}>claim</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {/* ── My orders ── */}
          {myOrders.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>MY ORDERS</Text>
              {myOrders.map(o => (
                <View key={o.id} style={[styles.orderRow, { borderBottomColor: c.border }]}>
                  <View style={styles.orderInfo}>
                    <Text style={[styles.orderName, { color: c.text }]}>{o.item_name}</Text>
                    {o.note && <Text style={[styles.orderNote, { color: c.muted }]}>{o.note}</Text>}
                    <Text style={[styles.orderMeta, { color: c.muted }]}>{priceFmt(o.total_cents)}</Text>
                  </View>
                  <Text style={[styles.statusBadge, { color: o.status === 'claimed' ? c.accent : c.muted }]}>
                    {o.status}
                  </Text>
                </View>
              ))}
            </>
          )}

          {menu.length === 0 && myOrders.length === 0 && openClaims.length === 0 && (
            <Text style={[styles.empty, { color: c.muted }]}>no food menu yet</Text>
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
  statusBlock: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  statusLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  statusDate: { fontSize: 16, fontFamily: fonts.playfair },
  statusHint: { fontSize: 13, fontFamily: fonts.dmSans },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  progressFill: { height: 3, borderRadius: 2 },
  sectionLabel: {
    fontSize: 10,
    fontFamily: fonts.dmMono,
    letterSpacing: 1.5,
    paddingHorizontal: SPACING.md,
    paddingTop: 16,
    paddingBottom: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  menuInfo: { flex: 1, gap: 3 },
  menuName: { fontSize: 16, fontFamily: fonts.playfair },
  menuDesc: { fontSize: 12, fontFamily: fonts.dmSans },
  menuPrice: { fontSize: 14, fontFamily: fonts.dmMono },
  compose: {
    margin: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: SPACING.md,
    gap: 12,
  },
  composeTitle: { fontSize: 15, fontFamily: fonts.dmSans, fontWeight: '600' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qtyLabel: { fontSize: 12, fontFamily: fonts.dmMono },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  qtyBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontSize: 20, lineHeight: 24 },
  qtyValue: { fontSize: 16, fontFamily: fonts.dmMono, minWidth: 20, textAlign: 'center' },
  extraHint: { fontSize: 12, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  forSomeoneLink: { fontSize: 12, fontFamily: fonts.dmSans },
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
  noteInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: fonts.dmSans,
  },
  totalLine: { fontSize: 12, fontFamily: fonts.dmMono, textAlign: 'right' },
  refundNote: { fontSize: 11, fontFamily: fonts.dmSans, fontStyle: 'italic', textAlign: 'center' },
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
  orderNote: { fontSize: 12, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  orderMeta: { fontSize: 11, fontFamily: fonts.dmMono },
  claimBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  claimBtnText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  statusBadge: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  empty: { fontSize: 13, fontFamily: fonts.dmSans, paddingHorizontal: SPACING.md, paddingTop: SPACING.lg, fontStyle: 'italic' },
});
