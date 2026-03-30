import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { STRAWBERRIES } from '../data/seed';
import { fetchVarieties } from '../lib/api';
import { useOrder } from '../context/OrderContext';
import { COLORS, SPACING } from '../theme';
import { RootTabParamList } from '../types';

type Nav = BottomTabNavigationProp<RootTabParamList, 'Board'>;

const TABS = ['CANADIAN', 'INTERNATIONAL', 'SEASONS'] as const;
type Tab = (typeof TABS)[number];

interface LiveVariety {
  id: number;
  name: string;
  price_cents: number;
  stock_remaining: number;
}

function formatDate(date: Date): string {
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

export default function BoardScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('CANADIAN');
  const [liveVarieties, setLiveVarieties] = useState<Record<string, LiveVariety>>({});
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<Nav>();
  const { setVariety } = useOrder();
  const insets = useSafeAreaInsets();
  const today = formatDate(new Date());

  useEffect(() => {
    fetchVarieties()
      .then((data: LiveVariety[]) => {
        const map: Record<string, LiveVariety> = {};
        data.forEach((v) => { map[v.name] = v; });
        setLiveVarieties(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = STRAWBERRIES.filter((s) => s.tab === activeTab);

  const handleOrder = (name: string) => {
    const live = liveVarieties[name];
    if (!live) return;
    setVariety(live.id, name, live.price_cents);
    (navigation as any).navigate('Order', { screen: 'Step2Chocolate' });
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.dateLabel}>{today}</Text>
        <Text style={styles.headerTitle}>{'What is ready\ntoday.'}</Text>
        <Text style={styles.headerSubtitle}>We dip to order. The chocolate is always warm.</Text>
        <View style={styles.tabRow}>
          {TABS.map((tab) => (
            <TouchableOpacity key={tab} style={styles.tab} onPress={() => setActiveTab(tab)} activeOpacity={0.7}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
              {activeTab === tab && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={COLORS.forestGreen} style={{ marginTop: 40 }} />
        ) : filtered.length > 0 ? (
          filtered.map((s) => {
            const live = liveVarieties[s.name];
            const price = live ? (live.price_cents / 100).toFixed(2) : s.price.toFixed(2);
            const stock = live ? live.stock_remaining : s.quantity;
            const outOfStock = live ? live.stock_remaining === 0 : false;
            const isHighlighted = !!s.tag;

            return (
              <View key={s.id} style={[styles.card, isHighlighted && styles.cardHighlighted, outOfStock && styles.cardDim]}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardTitleGroup}>
                    <Text style={styles.cardFlag}>{s.flag}</Text>
                    <Text style={styles.cardName}>{s.name}</Text>
                    {s.tag && (
                      <View style={styles.tagBadge}>
                        <Text style={styles.tagBadgeText}>{s.tag}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.priceGroup}>
                    <Text style={styles.cardPrice}>CA${price}</Text>
                    <Text style={styles.cardPriceSuffix}>each</Text>
                  </View>
                </View>

                <Text style={styles.cardFarm}>{s.farm}</Text>
                <Text style={styles.cardDescription}>{s.description}</Text>
                <View style={styles.divider} />

                <View style={styles.freshnessTrack}>
                  <View style={[styles.freshnessBar, { width: `${s.freshnessLevel * 100}%` as any, backgroundColor: s.freshnessColor }]} />
                </View>

                <View style={styles.cardBottomRow}>
                  <Text style={styles.harvestDate}>{s.harvestDate}</Text>
                  <View style={styles.quantityRow}>
                    <View style={[styles.quantityDot, { backgroundColor: outOfStock ? '#C0392B' : s.isPreOrder ? s.freshnessColor : '#2D8A2D' }]} />
                    <Text style={[styles.quantityLabel, outOfStock && { color: '#C0392B' }]}>
                      {outOfStock ? 'Sold out' : `${stock} remaining`}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.orderBtn, outOfStock && styles.orderBtnDisabled]}
                  onPress={outOfStock ? undefined : () => handleOrder(s.name)}
                  activeOpacity={outOfStock ? 1 : 0.85}
                >
                  <Text style={styles.orderBtnText}>
                    {outOfStock ? 'SOLD OUT' : 'ORDER THIS STRAWBERRY  →'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Nothing ready today.</Text>
            <Text style={styles.emptySubtext}>Check back soon.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: COLORS.forestGreen },
  dateLabel: { color: 'rgba(255,255,255,0.48)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', paddingHorizontal: SPACING.md, marginBottom: 8 },
  headerTitle: { color: COLORS.white, fontSize: 40, fontFamily: 'PlayfairDisplay_700Bold', paddingHorizontal: SPACING.md, lineHeight: 46, marginBottom: 10 },
  headerSubtitle: { color: 'rgba(255,255,255,0.52)', fontSize: 13, fontStyle: 'italic', paddingHorizontal: SPACING.md, marginBottom: 22 },
  tabRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.18)' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 13, position: 'relative' },
  tabText: { color: 'rgba(255,255,255,0.38)', fontSize: 11, letterSpacing: 1.5, fontWeight: '600' },
  tabTextActive: { color: COLORS.white },
  tabUnderline: { position: 'absolute', bottom: 0, left: 14, right: 14, height: 2, backgroundColor: COLORS.white, borderRadius: 1 },
  listContent: { padding: SPACING.md, gap: SPACING.md },
  card: { backgroundColor: COLORS.cardBg, borderRadius: 14, padding: SPACING.md, gap: 9 },
  cardHighlighted: { backgroundColor: '#F5E8C8', borderWidth: 1.5, borderColor: 'rgba(196,151,58,0.45)' },
  cardDim: { opacity: 0.6 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' },
  cardFlag: { fontSize: 16 },
  cardName: { fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold', color: COLORS.textDark },
  tagBadge: { backgroundColor: COLORS.greenBadgeBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  tagBadgeText: { color: COLORS.greenBadgeText, fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  priceGroup: { alignItems: 'flex-end' },
  cardPrice: { fontSize: 18, fontWeight: '600', color: COLORS.textDark },
  cardPriceSuffix: { fontSize: 11, color: COLORS.textMuted },
  cardFarm: { fontSize: 12, color: COLORS.textMuted },
  cardDescription: { fontSize: 14, color: COLORS.textDark, fontStyle: 'italic', lineHeight: 21 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.separator },
  freshnessTrack: { height: 3, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
  freshnessBar: { height: 3, borderRadius: 2 },
  cardBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  harvestDate: { fontSize: 12, color: COLORS.textMuted },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  quantityDot: { width: 7, height: 7, borderRadius: 4 },
  quantityLabel: { fontSize: 12, color: COLORS.textMuted },
  orderBtn: { backgroundColor: COLORS.forestGreen, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 2 },
  orderBtnDisabled: { backgroundColor: COLORS.textMuted },
  orderBtnText: { color: COLORS.white, fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 18, color: COLORS.textMuted, fontFamily: 'PlayfairDisplay_700Bold' },
  emptySubtext: { fontSize: 13, color: COLORS.textMuted, marginTop: 8, fontStyle: 'italic' },
});
