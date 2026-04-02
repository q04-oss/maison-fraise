import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, RefreshControl,
  StyleSheet, ActivityIndicator, Linking, Platform, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import { fetchBusinessPortraits, fetchBusinessVisitCount, fetchBusinessPopupStats, fetchPlacedHistory, createTip } from '../../lib/api';
import { useStripe } from '@stripe/stripe-react-native';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatPopupDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function formatContact(contact: string): { label: string; url: string } {
  const trimmed = contact.trim();
  if (trimmed.includes('@') && !trimmed.startsWith('@')) {
    return { label: trimmed, url: `mailto:${trimmed}` };
  }
  if (/^\+?[\d\s\-()]{7,}$/.test(trimmed)) {
    return { label: trimmed, url: `tel:${trimmed.replace(/\s/g, '')}` };
  }
  // Instagram handle or URL
  const handle = trimmed.replace('@', '');
  return { label: `@${handle}`, url: `https://instagram.com/${handle}` };
}

export default function PartnerDetailPanel() {
  const { goBack, showPanel, setActiveLocation, activeLocation, setPanelData, panelData } = usePanel();
  const c = useColors();
  const [portraits, setPortraits] = useState<{ id: number; url: string; season: string; subject_name?: string }[]>([]);
  const [visitCount, setVisitCount] = useState<number | null>(null);
  const [popupStats, setPopupStats] = useState<{
    next_popup: any | null;
    past_popup_count: number;
  } | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [placedHistory, setPlacedHistory] = useState<any[]>([]);
  const [tipping, setTipping] = useState(false);
  const [tipAmount, setTipAmount] = useState<number | null>(null);

  const biz = activeLocation;

  useEffect(() => {
    AsyncStorage.getItem('verified').then(v => setIsVerified(v === 'true')).catch(() => {});
  }, []);

  const loadData = (isRefresh = false) => {
    if (!biz) { setLoading(false); return; }
    Promise.all([
      fetchBusinessPortraits(biz.id).catch(() => []),
      fetchBusinessVisitCount(biz.id).catch(() => null),
      fetchBusinessPopupStats(biz.id).catch(() => null),
      fetchPlacedHistory(biz.id).catch(() => []),
    ]).then(([p, v, s, h]) => {
      setPortraits(p as any[]);
      setVisitCount(v ? (v as any).visit_count : null);
      setPopupStats(s as any);
      setPlacedHistory(h as any[]);
    }).finally(() => { setLoading(false); if (isRefresh) setRefreshing(false); });
  };

  useEffect(() => { loadData(); }, [biz?.id]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const handleInstagram = (handle: string) => {
    Linking.openURL(`https://instagram.com/${handle.replace('@', '')}`);
  };

  const handleOpenMaps = () => {
    if (!biz?.address) return;
    const encoded = encodeURIComponent(biz.address);
    const url = Platform.OS === 'ios' ? `maps://?q=${encoded}` : `geo:0,0?q=${encoded}`;
    Linking.openURL(url);
  };

  const handleContactPress = () => {
    if (!biz?.contact) return;
    const { url } = formatContact(biz.contact);
    Linking.openURL(url);
  };

  const handleViewPopup = (popup: any) => {
    setActiveLocation({ ...popup, type: 'popup' });
    showPanel('popup-detail');
  };

  const handleCommission = () => {
    if (!isVerified) {
      Alert.alert('Verified members only', 'Collect your first order in person to unlock campaign commissions.');
      return;
    }
    if (biz?.instagram_handle) {
      Alert.alert(
        'Commission a campaign here',
        `Reach out to Maison Fraise via Instagram to book a portrait campaign at ${biz?.name}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Instagram', onPress: () => Linking.openURL('https://instagram.com/maisonfraise') },
        ]
      );
    } else {
      Alert.alert(
        'Commission a campaign here',
        'Reach out to Maison Fraise on Instagram to book a portrait campaign at this location.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Instagram', onPress: () => Linking.openURL('https://instagram.com/maisonfraise') },
        ]
      );
    }
  };

  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const handleTip = async (cents: number) => {
    if (!biz || tipping) return;
    setTipping(true);
    setTipAmount(cents);
    try {
      const { client_secret } = await createTip(biz.id, cents);
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: 'Maison Fraise',
      });
      if (initError) throw new Error(initError.message);
      const { error: presentError } = await presentPaymentSheet();
      if (presentError && presentError.code !== 'Canceled') {
        Alert.alert('Payment failed', presentError.message);
      }
    } catch (err: any) {
      Alert.alert('Could not process tip', err.message ?? 'Please try again.');
    } finally {
      setTipping(false);
      setTipAmount(null);
    }
  };

  const handleOpenLookbook = (initialIndex = 0) => {
    setPanelData({ initialIndex });
    showPanel('lookbook');
  };

  if (!biz) return null;

  const campaigns = portraits.reduce<Record<string, typeof portraits>>((acc, p) => {
    const key = p.season ?? 'Archive';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});
  const campaignKeys = Object.keys(campaigns);

  const nextPopup = popupStats?.next_popup ?? null;
  const pastPopupCount = popupStats?.past_popup_count ?? 0;
  const contactInfo = biz.contact ? formatContact(biz.contact) : null;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{biz.name}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>

        {/* Currently placed user */}
        {biz.placed_user_name && (
          <View style={[styles.placedBanner, { backgroundColor: '#FDF6E3', borderColor: '#C9973A22' }]}>
            <View style={styles.placedDot} />
            <Text style={[styles.placedText, { color: '#7A5C1E' }]}>
              {biz.placed_user_name} is here right now
            </Text>
          </View>
        )}

        {/* Business info */}
        <View style={[styles.infoBlock, { borderBottomColor: c.border }]}>
          {!!biz.description && (
            <Text style={[styles.description, { color: c.text }]}>{biz.description}</Text>
          )}

          {/* Chips row */}
          <View style={styles.chipsRow}>
            {!!biz.neighbourhood && (
              <Text style={[styles.chip, { color: c.muted, borderColor: c.border }]}>{biz.neighbourhood}</Text>
            )}
            {visitCount !== null && visitCount > 0 && (
              <Text style={[styles.chip, { color: c.muted, borderColor: c.border }]}>
                {visitCount} member {visitCount === 1 ? 'visit' : 'visits'}
              </Text>
            )}
            {pastPopupCount > 0 && (
              <Text style={[styles.chip, { color: c.muted, borderColor: c.border }]}>
                {pastPopupCount} {pastPopupCount === 1 ? 'popup' : 'popups'} hosted
              </Text>
            )}
          </View>

          {/* Hours */}
          {!!biz.hours && (
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>HOURS</Text>
              <Text style={[styles.fieldValue, { color: c.text }]}>{biz.hours}</Text>
            </View>
          )}

          {/* Contact */}
          {contactInfo && (
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>CONTACT</Text>
              <TouchableOpacity onPress={handleContactPress} activeOpacity={0.7}>
                <Text style={[styles.fieldValue, { color: c.accent }]}>{contactInfo.label}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Address + Maps */}
          <View style={styles.addressRow}>
            <Text style={[styles.addressText, { color: c.muted }]}>{biz.address}</Text>
            <TouchableOpacity onPress={handleOpenMaps} activeOpacity={0.7}>
              <Text style={[styles.mapsLink, { color: c.accent }]}>Open in Maps →</Text>
            </TouchableOpacity>
          </View>

          {/* Instagram handle */}
          {!!biz.instagram_handle && (
            <TouchableOpacity
              onPress={() => Linking.openURL(`https://www.instagram.com/${biz.instagram_handle!.replace('@', '')}`)}
              activeOpacity={0.7}
              style={styles.instagramRow}
            >
              <Text style={[styles.fieldLabel, { color: c.muted }]}>INSTAGRAM</Text>
              <Text style={[styles.instagramHandle, { color: c.accent }]}>
                @{biz.instagram_handle.replace('@', '')}
              </Text>
            </TouchableOpacity>
          )}

          {/* Links */}
          <View style={styles.linksRow}>
            {!!biz.instagram_handle && (
              <TouchableOpacity
                style={[styles.linkBtn, { borderColor: c.border }]}
                onPress={() => handleInstagram(biz.instagram_handle!)}
                activeOpacity={0.7}
              >
                <Text style={[styles.linkBtnText, { color: c.text }]}>
                  @{biz.instagram_handle.replace('@', '')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Upcoming popup at this venue */}
        {nextPopup && (
          <View style={[styles.popupCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>UPCOMING POPUP HERE</Text>
            <Text style={[styles.popupName, { color: c.text }]}>{nextPopup.name}</Text>
            <View style={styles.popupMeta}>
              <Text style={[styles.popupDate, { color: c.muted }]}>
                {formatPopupDate(nextPopup.starts_at)}
                {nextPopup.neighbourhood ? ` · ${nextPopup.neighbourhood}` : ''}
              </Text>
              {nextPopup.entrance_fee_cents && (
                <Text style={[styles.popupFee, { color: c.muted }]}>
                  CA${(nextPopup.entrance_fee_cents / 100).toFixed(0)} entry
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.viewPopupBtn, { borderColor: c.border }]}
              onPress={() => handleViewPopup(nextPopup)}
              activeOpacity={0.75}
            >
              <Text style={[styles.viewPopupText, { color: c.text }]}>View popup →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Commission a campaign CTA */}
        <TouchableOpacity
          style={[styles.commissionCard, { borderColor: c.border }]}
          onPress={handleCommission}
          activeOpacity={0.8}
        >
          <View style={styles.commissionInfo}>
            <Text style={[styles.commissionTitle, { color: c.text }]}>Commission a campaign here</Text>
            <Text style={[styles.commissionSub, { color: c.muted }]}>
              Portrait shoot · Verified members only
            </Text>
          </View>
          <Text style={[styles.chevron, { color: c.muted }]}>›</Text>
        </TouchableOpacity>

        {/* Tip section */}
        {biz.placed_user_name && (
          <View style={[styles.tipCard, { borderColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>TIP {biz.placed_user_name.toUpperCase()}</Text>
            <View style={styles.tipAmounts}>
              {[300, 500, 1000].map(cents => (
                <TouchableOpacity
                  key={cents}
                  style={[styles.tipBtn, { borderColor: c.border }, tipping && tipAmount === cents && { opacity: 0.5 }]}
                  onPress={() => handleTip(cents)}
                  activeOpacity={0.75}
                  disabled={tipping}
                >
                  <Text style={[styles.tipBtnText, { color: c.text }]}>CA${(cents / 100).toFixed(0)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Placed history section */}
        {placedHistory.length > 0 && (
          <View style={styles.historySection}>
            <Text style={[styles.sectionLabel, { color: c.muted, paddingHorizontal: SPACING.md }]}>WHO'S BEEN HERE</Text>
            {placedHistory.map(h => (
              <TouchableOpacity
                key={h.user_id}
                style={[styles.historyRow, { borderBottomColor: c.border }]}
                onPress={() => { setPanelData({ userId: h.user_id }); showPanel('user-profile'); }}
                activeOpacity={0.75}
              >
                <Text style={[styles.historyName, { color: c.text }]}>{h.display_name}</Text>
                <Text style={[styles.historyDates, { color: c.muted }]}>
                  {new Date(h.starts_at).getFullYear()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Campaign portrait rails */}
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : campaignKeys.length > 0 && (
          <View style={styles.portraitsSection}>
            <View style={styles.campaignsHeader}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>CAMPAIGNS</Text>
              <TouchableOpacity onPress={() => handleOpenLookbook(0)} activeOpacity={0.7}>
                <Text style={[styles.viewAll, { color: c.accent }]}>View all →</Text>
              </TouchableOpacity>
            </View>
            {campaignKeys.map(season => (
              <View key={season} style={styles.campaign}>
                <Text style={[styles.campaignSeason, { color: c.muted }]}>{season}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.portraitRail}
                >
                  {campaigns[season].map(p => (
                    <View key={p.id} style={styles.portraitItem}>
                      <Image
                        source={{ uri: p.url }}
                        style={[styles.portraitImage, { backgroundColor: c.card }]}
                        resizeMode="cover"
                      />
                      {!!p.subject_name && (
                        <Text style={[styles.portraitName, { color: c.muted }]}>{p.subject_name}</Text>
                      )}
                    </View>
                  ))}
                </ScrollView>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
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
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  body: { flex: 1 },

  placedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  placedDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#C9973A' },
  placedText: { fontSize: 13, fontFamily: fonts.dmSans },

  infoBlock: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  description: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 22 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    fontSize: 11, fontFamily: fonts.dmMono,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },

  fieldRow: { gap: 3 },
  fieldLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  fieldValue: { fontSize: 13, fontFamily: fonts.dmSans },

  addressRow: { gap: 3 },
  addressText: { fontSize: 12, fontFamily: fonts.dmSans },
  mapsLink: { fontSize: 12, fontFamily: fonts.dmMono },

  instagramRow: { gap: 3 },
  instagramHandle: { fontSize: 13, fontFamily: fonts.dmMono },

  linksRow: { flexDirection: 'row', gap: 10 },
  linkBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  linkBtnText: { fontSize: 12, fontFamily: fonts.dmMono },

  sectionLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5 },

  popupCard: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    borderRadius: 14,
    padding: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  popupName: { fontSize: 17, fontFamily: fonts.playfair },
  popupMeta: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  popupDate: { fontSize: 12, fontFamily: fonts.dmMono },
  popupFee: { fontSize: 12, fontFamily: fonts.dmMono },
  viewPopupBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  viewPopupText: { fontSize: 14, fontFamily: fonts.dmSans },

  commissionCard: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    borderRadius: 14,
    padding: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  commissionInfo: { flex: 1, gap: 3 },
  commissionTitle: { fontSize: 15, fontFamily: fonts.playfair },
  commissionSub: { fontSize: 12, fontFamily: fonts.dmSans },
  chevron: { fontSize: 22 },

  portraitsSection: { paddingTop: SPACING.md, gap: 20 },
  campaign: { gap: 10 },
  campaignSeason: { fontSize: 12, fontFamily: fonts.dmMono, paddingHorizontal: SPACING.md },
  portraitRail: { paddingHorizontal: SPACING.md, gap: 10 },
  portraitItem: { gap: 5 },
  portraitImage: { width: 160, height: 200, borderRadius: 4 },
  portraitName: { fontSize: 11, fontFamily: fonts.dmMono, textAlign: 'center', width: 160 },

  tipCard: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    borderRadius: 14,
    padding: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  tipAmounts: { flexDirection: 'row', gap: 10 },
  tipBtn: {
    flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  tipBtnText: { fontSize: 15, fontFamily: fonts.dmMono },

  historySection: { paddingTop: SPACING.md, gap: 0 },
  historyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyName: { fontSize: 15, fontFamily: fonts.playfair },
  historyDates: { fontSize: 11, fontFamily: fonts.dmMono },

  campaignsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  viewAll: { fontSize: 12, fontFamily: fonts.dmMono },
});
