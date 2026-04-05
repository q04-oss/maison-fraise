import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStripe } from '@stripe/stripe-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { fetchMarket, createMarketOrder } from '../../lib/api';
import { useColors, fonts, SPACING } from '../../theme';

function fmtCAD(cents: number) {
  return `CA$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
}

export default function MarketStallPanel() {
  const { goBack, showPanel, panelData } = usePanel();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const stallId: number | null = panelData?.stallId ?? null;
  const marketId: number | null = panelData?.marketId ?? null;

  const [stall, setStall] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<number | null>(null); // product id being purchased
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('verified').then(v => setIsVerified(v === 'true'));
  }, []);

  useEffect(() => {
    if (!marketId || !stallId) { setLoading(false); return; }
    fetchMarket(marketId)
      .then(market => {
        const found = (market.stalls ?? []).find((s: any) => s.id === stallId);
        setStall(found ?? null);
      })
      .catch(() => Alert.alert('Error', 'Could not load stall.'))
      .finally(() => setLoading(false));
  }, [stallId, marketId]);

  const handleBuy = async (product: any) => {
    if (!marketId || buying) return;
    setBuying(product.id);
    try {
      const { client_secret, amount_cents } = await createMarketOrder(marketId, product.id, 1);
      const { error: initErr } = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: 'Maison Fraise',
      });
      if (initErr) throw new Error(initErr.message);
      const { error: presentErr } = await presentPaymentSheet();
      if (presentErr) {
        if (presentErr.code !== 'Canceled') Alert.alert('Payment failed', 'Please try again.');
        return;
      }
      Alert.alert(
        'Pre-buy confirmed.',
        `${fmtCAD(amount_cents)} held. Pick up at the market on the day.`,
      );
    } catch (e: any) {
      Alert.alert('Could not pre-buy', e.message ?? 'Please try again.');
    } finally {
      setBuying(null);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  if (!stall) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg, justifyContent: 'center', alignItems: 'center' }]}>
        <TouchableOpacity onPress={goBack} style={{ position: 'absolute', top: 22, left: 16 }} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.empty, { color: c.muted }]}>Vendor not found.</Text>
      </View>
    );
  }

  const products: any[] = stall.products ?? [];

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{stall.vendor_name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: SPACING.md, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {stall.description && (
          <Text style={[styles.description, { color: c.muted }]}>{stall.description}</Text>
        )}

        {isVerified && (
          <TouchableOpacity
            style={[styles.proposeBtn, { borderColor: c.border }]}
            onPress={() => showPanel('collectif-create', {
              collectifType: 'product_prebuy',
              businessName: stall.vendor_name,
              proposedDate: panelData?.marketDateStr,
            })}
            activeOpacity={0.7}
          >
            <Text style={[styles.proposeBtnText, { color: c.accent }]}>
              propose a pre-buy collectif for this vendor →
            </Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.sectionLabel, { color: c.muted }]}>PRODUCTS</Text>

        {products.length === 0 ? (
          <Text style={[styles.empty, { color: c.muted }]}>no products listed yet</Text>
        ) : (
          products.map((product: any) => (
            <View key={product.id} style={[styles.productRow, { borderBottomColor: c.border }]}>
              <View style={styles.productInfo}>
                <Text style={[styles.productName, { color: c.text }]}>{product.name}</Text>
                {product.description && (
                  <Text style={[styles.productDesc, { color: c.muted }]} numberOfLines={2}>
                    {product.description}
                  </Text>
                )}
                <Text style={[styles.productPrice, { color: c.muted }]}>
                  {fmtCAD(product.price_cents)} / {product.unit}
                  {product.stock_quantity !== null ? `  ·  ${product.stock_quantity} available` : ''}
                </Text>
              </View>
              {isVerified && (
                <TouchableOpacity
                  style={[styles.buyBtn, { backgroundColor: c.text }, buying === product.id && { opacity: 0.5 }]}
                  onPress={() => handleBuy(product)}
                  disabled={buying !== null}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.buyBtnText, { color: c.ctaText }]}>
                    {buying === product.id ? '…' : 'pre-buy'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}

        {!isVerified && (
          <View style={styles.gateContainer}>
            <Text style={[styles.gateNote, { color: c.muted }]}>Verified members can pre-buy.</Text>
            <TouchableOpacity onPress={() => showPanel('verifyNFC')} activeOpacity={0.7}>
              <Text style={[styles.verifyLink, { color: c.accent }]}>get verified →</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },

  description: { fontFamily: fonts.dmSans, fontSize: 14, lineHeight: 22, marginBottom: 20, fontStyle: 'italic' },

  proposeBtn: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 16, marginBottom: 24,
  },
  proposeBtnText: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 0.5 },

  sectionLabel: {
    fontFamily: fonts.dmMono, fontSize: 9, letterSpacing: 1.5,
    marginBottom: 12,
  },

  empty: { fontFamily: fonts.dmSans, fontSize: 13, fontStyle: 'italic' },

  productRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  productInfo: { flex: 1, gap: 4 },
  productName: { fontFamily: fonts.playfair, fontSize: 17 },
  productDesc: { fontFamily: fonts.dmSans, fontSize: 12, lineHeight: 18 },
  productPrice: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 0.5 },

  buyBtn: {
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10,
    alignItems: 'center',
  },
  buyBtnText: { fontFamily: fonts.dmSans, fontSize: 13, fontWeight: '700' },

  gateContainer: { marginTop: 32, alignItems: 'center', gap: 10 },
  gateNote: { fontFamily: fonts.dmSans, fontSize: 13, fontStyle: 'italic' },
  verifyLink: { fontFamily: fonts.dmMono, fontSize: 11, letterSpacing: 0.5 },
});
