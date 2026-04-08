import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchWalkInInventory } from '../../lib/api';

export default function WalkInInventoryPanel() {
  const { goHome, panelData, showPanel } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const locationId: number = panelData?.location_id;
  const locationName: string = panelData?.location_name ?? 'this location';

  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWalkInInventory(locationId)
      .then(setInventory)
      .finally(() => setLoading(false));
  }, [locationId]);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={goHome} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>
          {locationName.toLowerCase()}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.notice, { color: c.muted, fontFamily: fonts.dmSans }]}>
          This box has already been purchased.
        </Text>

        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : inventory.length === 0 ? (
          <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>
            No boxes available right now.
          </Text>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>
              STILL AVAILABLE
            </Text>
            {inventory.map((item) => (
              <View
                key={item.variety_id}
                style={[styles.varietyRow, { borderColor: c.border }]}
              >
                <View style={styles.varietyLeft}>
                  <Text style={[styles.varietyName, { color: c.text, fontFamily: fonts.playfair }]}>
                    {item.variety_name}
                  </Text>
                  {item.description ? (
                    <Text style={[styles.varietyDesc, { color: c.muted, fontFamily: fonts.dmSans }]} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                  <Text style={[styles.availableCount, { color: c.muted, fontFamily: fonts.dmMono }]}>
                    {item.available} {item.available === 1 ? 'box' : 'boxes'} left  ·  CA${(item.price_cents / 100).toFixed(0)}
                  </Text>
                </View>
              </View>
            ))}
            <Text style={[styles.hint, { color: c.muted, fontFamily: fonts.dmSans }]}>
              Tap the sticker on an available box to purchase it.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 13, letterSpacing: 2 },
  headerSpacer: { width: 28 },
  body: { padding: SPACING.md, paddingBottom: 60, gap: SPACING.md },
  notice: { fontSize: 14, lineHeight: 22, fontStyle: 'italic', paddingBottom: SPACING.sm },
  sectionLabel: { fontSize: 10, letterSpacing: 2 },
  varietyRow: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 8,
    padding: SPACING.md, flexDirection: 'row',
    alignItems: 'center', gap: SPACING.sm,
  },
  varietyLeft: { flex: 1, gap: 4 },
  varietyName: { fontSize: 22 },
  varietyDesc: { fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
  availableCount: { fontSize: 11, letterSpacing: 0.5 },
  arrow: { fontSize: 12, fontFamily: fonts.dmMono },
  empty: { fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
  hint: { fontSize: 12, textAlign: 'center', lineHeight: 20, fontStyle: 'italic', opacity: 0.6 },
});
