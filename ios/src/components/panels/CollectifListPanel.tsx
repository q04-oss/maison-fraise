import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { fetchCollectifs, fetchCollectifsByBusiness } from '../../lib/api';
import { useColors, fonts, SPACING } from '../../theme';

function fmtCAD(cents: number) {
  return `CA$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
}

function daysLeft(deadline: string) {
  const diff = new Date(deadline).getTime() - Date.now();
  const d = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return d <= 0 ? 'expired' : d === 1 ? '1 day left' : `${d} days left`;
}

export default function CollectifListPanel() {
  const { goBack, showPanel, panelData } = usePanel();
  const c = useColors();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);

  const businessName: string | null = panelData?.businessName ?? null;
  const isPopup: boolean = panelData?.isPopup ?? false;

  useEffect(() => {
    AsyncStorage.getItem('verified').then(v => setIsVerified(v === 'true'));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const fetcher = businessName
      ? fetchCollectifsByBusiness(businessName)
      : fetchCollectifs();
    fetcher
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessName]);

  useEffect(() => { load(); }, [load]);

  const renderItem = ({ item }: { item: any }) => {
    const progress = item.target_quantity > 0
      ? Math.min(1, item.current_quantity / item.target_quantity)
      : 0;
    const isPopupType = item.collectif_type === 'popup';
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: c.border }]}
        onPress={() => showPanel('collectif-detail', { collectifId: item.id })}
        activeOpacity={0.75}
      >
        <View style={styles.rowTop}>
          <Text style={[styles.itemTitle, { color: c.text }]} numberOfLines={1}>{item.title}</Text>
          <Text style={[styles.itemPrice, { color: c.text }]}>
            {isPopupType ? fmtCAD(item.price_cents) : `${item.proposed_discount_pct}% off`}
          </Text>
        </View>

        <Text style={[styles.meta, { color: c.muted }]}>
          {[
            item.business_name,
            isPopupType && item.proposed_venue ? item.proposed_venue : null,
          ].filter(Boolean).join('  ·  ')}
          {isPopupType ? '  ·  popup' : ''}
        </Text>

        <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` as any, backgroundColor: c.accent }]} />
        </View>

        <View style={styles.rowBottom}>
          <Text style={[styles.meta, { color: c.muted }]}>
            {isPopupType
              ? `${item.current_quantity} / ${item.target_quantity} attending`
              : `${item.current_quantity} / ${item.target_quantity}  ·  ${fmtCAD(item.price_cents)}/unit`
            }
          </Text>
          <Text style={[styles.meta, { color: c.muted }]}>{daysLeft(item.deadline)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const headerTitle = businessName
    ? businessName.toLowerCase()
    : 'collectifs';

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{headerTitle}</Text>
          {businessName && (
            <Text style={[styles.subtitle, { color: c.muted }]}>collectifs</Text>
          )}
        </View>
        {isVerified ? (
          <TouchableOpacity
            onPress={() => showPanel('collectif-create', {
              businessName: businessName ?? undefined,
              isPopup: isPopup || undefined,
            })}
            style={styles.headerAction}
            activeOpacity={0.7}
          >
            <Text style={[styles.headerActionText, { color: c.accent }]}>propose</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <Text style={[styles.empty, { color: c.muted }]}>
          {isVerified ? 'nothing here yet — be the first to propose' : 'nothing here yet'}
        </Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={<View style={{ height: 40 }} />}
        />
      )}
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
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { fontSize: 20, fontFamily: fonts.playfair, textAlign: 'center' },
  subtitle: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginTop: 2 },
  headerAction: { width: 60, alignItems: 'flex-end' },
  headerActionText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  headerSpacer: { width: 60 },

  empty: { textAlign: 'center', marginTop: 60, fontSize: 13, fontFamily: fonts.dmSans, fontStyle: 'italic' },

  row: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 5,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  itemTitle: { fontSize: 22, fontFamily: fonts.playfair, flex: 1 },
  itemPrice: { fontSize: 13, fontFamily: fonts.dmMono },
  meta: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  progressTrack: { height: 2, borderRadius: 1, overflow: 'hidden', marginVertical: 4 },
  progressFill: { height: '100%', borderRadius: 1 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
