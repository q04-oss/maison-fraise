import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchStickers } from '../../lib/api';

interface StickerBusiness {
  id: number;
  name: string;
  type: string;
  neighbourhood: string | null;
  sticker_concept: string | null;
  sticker_emoji: string | null;
  sticker_image_url: string | null;
}

export default function MerchPanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();
  const [stickers, setStickers] = useState<StickerBusiness[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStickers().then(s => setStickers(s)).finally(() => setLoading(false));
  }, []);

  const handleSend = (biz: StickerBusiness) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showPanel('gift', { businessId: biz.id, businessName: biz.name });
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>STRAWBERRY SHOP</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: c.muted }]}>
          Collect a city. Send one to a friend. Digital or physical — they'll get a claim code by email.
        </Text>

        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : (
          stickers.map((biz, i) => (
            <TouchableOpacity
              key={biz.id}
              style={[
                styles.card,
                { backgroundColor: c.card, borderColor: c.border },
                i === stickers.length - 1 && { marginBottom: 0 },
              ]}
              onPress={() => handleSend(biz)}
              activeOpacity={0.8}
            >
              <View style={styles.cardLeft}>
                {biz.sticker_image_url ? (
                  <Image source={{ uri: biz.sticker_image_url }} style={styles.stickerImg} />
                ) : (
                  <Text style={styles.cardEmoji}>{biz.sticker_emoji ?? '🍓'}</Text>
                )}
              </View>
              <View style={styles.cardBody}>
                <Text style={[styles.bizName, { color: c.text }]}>{biz.name}</Text>
                {biz.neighbourhood ? (
                  <Text style={[styles.neighbourhood, { color: c.muted }]}>{biz.neighbourhood}</Text>
                ) : null}
                {biz.sticker_concept ? (
                  <Text style={[styles.concept, { color: c.muted }]}>{biz.sticker_concept}</Text>
                ) : null}
              </View>
              <Text style={[styles.arrow, { color: c.accent }]}>→</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40 },
  backText: { fontSize: 22 },
  title: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  scroll: { padding: SPACING.md, paddingBottom: 60, gap: 10 },
  intro: {
    fontFamily: fonts.dmSans, fontSize: 13, lineHeight: 20,
    marginBottom: 8,
  },
  card: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  cardLeft: { width: 56, alignItems: 'center' },
  cardEmoji: { fontSize: 28 },
  stickerImg: { width: 52, height: 52, borderRadius: 6 },
  cardBody: { flex: 1, gap: 3 },
  bizName: { fontFamily: fonts.playfair, fontSize: 17 },
  neighbourhood: { fontFamily: fonts.dmMono, fontSize: 10, letterSpacing: 0.5 },
  concept: { fontFamily: fonts.dmSans, fontSize: 12, lineHeight: 17, marginTop: 2 },
  arrow: { fontFamily: fonts.dmMono, fontSize: 18 },
});
