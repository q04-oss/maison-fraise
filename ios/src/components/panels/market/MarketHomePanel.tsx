import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../../theme';
import { fetchMarketListings, fetchMarketListingsForMe } from '../../../lib/api';
import { getTodayHealthContext } from '../../../lib/HealthKitService';

const CATEGORY_LABELS: Record<string, string> = {
  fruit: 'Fruit',
  vegetable: 'Vegetables',
  herb: 'Herbs',
  grain: 'Grains',
  dairy: 'Dairy',
  other: 'Other',
};

export default function MarketHomePanel() {
  const { showPanel } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [listings, setListings] = useState<any[]>([]);
  const [forMe, setForMe] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(true);
  const [cart, setCart] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchMarketListings();
        setListings(data);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    const loadForMe = async () => {
      try {
        const ctx = await getTodayHealthContext();
        const scored = await fetchMarketListingsForMe(ctx);
        setForMe(scored);
      } catch { /* ignore */ }
      finally { setHealthLoading(false); }
    };
    load();
    loadForMe();
  }, []);

  const cartCount = Array.from(cart.values()).reduce((a, b) => a + b, 0);

  const setQty = (id: number, delta: number) => {
    setCart(prev => {
      const next = new Map(prev);
      const current = next.get(id) ?? 0;
      const updated = current + delta;
      if (updated <= 0) {
        next.delete(id);
      } else {
        next.set(id, updated);
      }
      return next;
    });
  };

  const groupedListings = listings.reduce((acc: Record<string, any[]>, item) => {
    const cat = item.category ?? 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const handleOpenCart = () => {
    const items = Array.from(cart.entries()).map(([listing_id, quantity]) => ({
      listing_id,
      quantity,
      listing: listings.find(l => l.id === listing_id),
    }));
    showPanel('market-cart', { cart: items });
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <View style={styles.headerLeft} />
        <Text style={[styles.headerTitle, { color: c.text, fontFamily: fonts.dmMono }]}>MARKET</Text>
        <TouchableOpacity
          style={styles.cartBtn}
          onPress={cartCount > 0 ? handleOpenCart : undefined}
          activeOpacity={0.7}
        >
          <Text style={[styles.cartIcon, { color: c.accent }]}>
            {cartCount > 0 ? `🛒 ${cartCount}` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* For-you section */}
          {forMe.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>
                THIS WEEK FOR YOU
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.forMeRow}>
                {forMe.map(item => {
                  const qty = cart.get(item.id) ?? 0;
                  return (
                    <View key={item.id} style={[styles.forMeCard, { backgroundColor: c.card, borderColor: c.border }]}>
                      <Text style={[styles.forMeName, { color: c.text, fontFamily: fonts.dmSans }]}>{item.name}</Text>
                      <Text style={[styles.forMeReason, { color: c.muted, fontFamily: fonts.dmSans }]}>{item.reason}</Text>
                      <Text style={[styles.forMePrice, { color: c.accent, fontFamily: fonts.dmMono }]}>
                        CA${(item.price_cents / 100).toFixed(2)} / {item.unit_label}
                      </Text>
                      {qty === 0 ? (
                        <TouchableOpacity
                          style={[styles.addBtn, { backgroundColor: c.accent }]}
                          onPress={() => setQty(item.id, 1)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.addBtnText, { color: c.ctaText ?? '#fff', fontFamily: fonts.dmMono }]}>+ ADD</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.qtyRow}>
                          <TouchableOpacity
                            style={[styles.qtyBtn, { borderColor: c.border }]}
                            onPress={() => setQty(item.id, -1)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.qtyBtnText, { color: c.text }]}>−</Text>
                          </TouchableOpacity>
                          <Text style={[styles.qtyCount, { color: c.text, fontFamily: fonts.dmMono }]}>{qty}</Text>
                          <TouchableOpacity
                            style={[styles.qtyBtn, { borderColor: c.border }]}
                            onPress={() => setQty(item.id, 1)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.qtyBtnText, { color: c.text }]}>+</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* All produce grouped by category */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>ALL PRODUCE</Text>
            {Object.keys(groupedListings).sort().map(cat => (
              <View key={cat} style={styles.catGroup}>
                <Text style={[styles.catLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>
                  {CATEGORY_LABELS[cat] ?? cat.toUpperCase()}
                </Text>
                {groupedListings[cat].map((item: any) => {
                  const qty = cart.get(item.id) ?? 0;
                  return (
                    <View key={item.id} style={[styles.listingRow, { backgroundColor: c.card, borderColor: c.border }]}>
                      <View style={styles.listingInfo}>
                        <Text style={[styles.listingName, { color: c.text, fontFamily: fonts.dmSans }]}>{item.name}</Text>
                        <Text style={[styles.listingVendor, { color: c.muted, fontFamily: fonts.dmSans }]}>{item.vendor_name}</Text>
                        <Text style={[styles.listingMeta, { color: c.accent, fontFamily: fonts.dmMono }]}>
                          CA${(item.price_cents / 100).toFixed(2)} / {item.unit_label}
                          {item.stock_quantity != null ? `  ·  ${item.stock_quantity} left` : ''}
                        </Text>
                        {Array.isArray(item.tags) && item.tags.length > 0 && (
                          <Text style={[styles.listingTags, { color: c.muted, fontFamily: fonts.dmSans }]}>
                            {(item.tags as string[]).join(' · ')}
                          </Text>
                        )}
                      </View>
                      <View style={styles.qtyControl}>
                        {qty === 0 ? (
                          <TouchableOpacity
                            style={[styles.inlineAddBtn, { borderColor: c.accent }]}
                            onPress={() => setQty(item.id, 1)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.inlineAddBtnText, { color: c.accent, fontFamily: fonts.dmMono }]}>+</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.qtyRow}>
                            <TouchableOpacity
                              style={[styles.qtyBtn, { borderColor: c.border }]}
                              onPress={() => setQty(item.id, -1)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.qtyBtnText, { color: c.text }]}>−</Text>
                            </TouchableOpacity>
                            <Text style={[styles.qtyCount, { color: c.text, fontFamily: fonts.dmMono }]}>{qty}</Text>
                            <TouchableOpacity
                              style={[styles.qtyBtn, { borderColor: c.border }]}
                              onPress={() => setQty(item.id, 1)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.qtyBtnText, { color: c.text }]}>+</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
            {listings.length === 0 && (
              <Text style={[styles.emptyText, { color: c.muted, fontFamily: fonts.dmSans }]}>
                No listings available this week.
              </Text>
            )}
          </View>

          {cartCount > 0 && (
            <TouchableOpacity
              style={[styles.cartBar, { backgroundColor: c.accent }]}
              onPress={handleOpenCart}
              activeOpacity={0.85}
            >
              <Text style={[styles.cartBarText, { color: c.ctaText ?? '#fff', fontFamily: fonts.dmMono }]}>
                VIEW ORDER ({cartCount} {cartCount === 1 ? 'item' : 'items'}) →
              </Text>
            </TouchableOpacity>
          )}

          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { width: 60 },
  headerTitle: { fontSize: 14, letterSpacing: 2 },
  cartBtn: { width: 60, alignItems: 'flex-end' },
  cartIcon: { fontSize: 14, fontFamily: 'System' },
  scroll: { flex: 1, paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  section: { marginBottom: SPACING.lg },
  sectionLabel: { fontSize: 11, letterSpacing: 1.5, marginBottom: SPACING.sm },
  forMeRow: { flexDirection: 'row' },
  forMeCard: {
    width: 180, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.sm, marginRight: SPACING.sm, gap: 4,
  },
  forMeName: { fontSize: 14, fontWeight: '500' },
  forMeReason: { fontSize: 12, lineHeight: 17, opacity: 0.8 },
  forMePrice: { fontSize: 12, marginTop: 2 },
  addBtn: { borderRadius: 10, paddingVertical: 8, alignItems: 'center', marginTop: 6 },
  addBtnText: { fontSize: 12, letterSpacing: 1 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 6 },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 16, lineHeight: 20 },
  qtyCount: { fontSize: 14, minWidth: 20, textAlign: 'center' },
  catGroup: { marginBottom: SPACING.md },
  catLabel: { fontSize: 10, letterSpacing: 1.5, marginBottom: 6 },
  listingRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.sm, marginBottom: 6,
  },
  listingInfo: { flex: 1 },
  listingName: { fontSize: 15 },
  listingVendor: { fontSize: 12, opacity: 0.7, marginTop: 1 },
  listingMeta: { fontSize: 12, marginTop: 3 },
  listingTags: { fontSize: 11, marginTop: 3, opacity: 0.7 },
  qtyControl: { paddingLeft: SPACING.sm },
  inlineAddBtn: {
    width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  inlineAddBtnText: { fontSize: 20, lineHeight: 24 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingTop: SPACING.lg },
  cartBar: {
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    marginTop: SPACING.md, marginBottom: SPACING.sm,
  },
  cartBarText: { fontSize: 13, letterSpacing: 1.5 },
});
