import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, RefreshControl,
  StyleSheet, ActivityIndicator, Linking, Platform, Alert,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { fetchBusinessPortraits, fetchBusinessVisitCount, createTip, fetchNearbyJobs, JobPosting, fetchToiletReviews, fetchBusinessSocial } from '../../lib/api';
import { useStripe } from '@stripe/stripe-react-native';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

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
  const { goBack, activeLocation, showPanel, setPanelData } = usePanel();
  const c = useColors();
  const [portraits, setPortraits] = useState<{ id: number; url: string; season: string; subject_name?: string }[]>([]);
  const [visitCount, setVisitCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tipping, setTipping] = useState(false);
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [toiletReviews, setToiletReviews] = useState<{ avg_rating: number | null; review_count: number; reviews: any[] } | null>(null);
  const [social, setSocial] = useState<{ evening_count: number; portrait_license_count: number; has_menu: boolean; recent_evening_at: string | null } | null>(null);

  const biz = activeLocation;

  const loadData = (isRefresh = false) => {
    if (!biz) { setLoading(false); return; }
    const toiletPromise = biz.has_toilet ? fetchToiletReviews(biz.id).catch(() => null) : Promise.resolve(null);
    Promise.all([
      fetchBusinessPortraits(biz.id).catch(() => []),
      fetchBusinessVisitCount(biz.id).catch(() => null),
      fetchNearbyJobs(biz.id).catch(() => []),
      toiletPromise,
      fetchBusinessSocial(biz.id).catch(() => null),
    ]).then(([p, v, j, t, s]) => {
      setPortraits(p as any[]);
      setVisitCount(v ? (v as any).visit_count : null);
      setJobs((j as JobPosting[]).filter(job => job.active));
      if (t) setToiletReviews(t as any);
      setSocial(s as any);
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

  const handleCommission = () => {
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

  if (!biz) return null;

  const campaigns = portraits.reduce<Record<string, typeof portraits>>((acc, p) => {
    const key = p.season ?? 'Archive';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});
  const campaignKeys = Object.keys(campaigns);

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

        {/* Social stats */}
        {(social && (social.evening_count > 0 || social.portrait_license_count > 0 || social.has_menu)) && (
          <View style={[styles.socialRow, { borderBottomColor: c.border }]}>
            {social.evening_count > 0 && (
              <View style={styles.socialStat}>
                <Text style={[styles.socialStatNum, { color: c.text }]}>{social.evening_count}</Text>
                <Text style={[styles.socialStatLabel, { color: c.muted }]}>
                  {social.evening_count === 1 ? 'EVENING' : 'EVENINGS'}
                </Text>
              </View>
            )}
            {social.portrait_license_count > 0 && (
              <View style={styles.socialStat}>
                <Text style={[styles.socialStatNum, { color: c.text }]}>{social.portrait_license_count}</Text>
                <Text style={[styles.socialStatLabel, { color: c.muted }]}>
                  {social.portrait_license_count === 1 ? 'PORTRAIT' : 'PORTRAITS'}
                </Text>
              </View>
            )}
            {social.has_menu && (
              <View style={styles.socialStat}>
                <Text style={[styles.socialStatNum, { color: c.accent }]}>✓</Text>
                <Text style={[styles.socialStatLabel, { color: c.muted }]}>MENU</Text>
              </View>
            )}
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

        {/* Jobs */}
        {jobs.length > 0 && (
          <View style={[styles.jobsSection, { borderBottomColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>OPEN POSITIONS</Text>
            {jobs.map(job => (
              <TouchableOpacity
                key={job.id}
                style={[styles.jobRow, { borderBottomColor: c.border }]}
                onPress={() => { setPanelData({ job, businessName: biz!.name }); showPanel('jobDetail'); }}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.jobTitle, { color: c.text }]}>{job.title}</Text>
                  <Text style={[styles.jobPay, { color: c.muted }]}>
                    {job.pay_type === 'hourly'
                      ? `$${(job.pay_cents / 100).toFixed(0)} / hr`
                      : `$${(job.pay_cents / 100).toLocaleString()} / yr`}
                  </Text>
                </View>
                <Text style={[styles.jobArrow, { color: c.accent }]}>→</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Toilet section */}
        {biz.has_toilet && (
          <View style={[styles.toiletSection, { borderBottomColor: c.border }]}>
            <View style={styles.toiletHeader}>
              <View>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>TOILET</Text>
                {toiletReviews && toiletReviews.review_count > 0 ? (
                  <View style={styles.toiletRatingRow}>
                    <Text style={[styles.toiletRating, { color: c.text }]}>
                      {'★'.repeat(Math.round(toiletReviews.avg_rating ?? 0))}{'☆'.repeat(5 - Math.round(toiletReviews.avg_rating ?? 0))}
                    </Text>
                    <Text style={[styles.toiletRatingCount, { color: c.muted }]}>
                      {toiletReviews.avg_rating?.toFixed(1)}  ·  {toiletReviews.review_count} {toiletReviews.review_count === 1 ? 'visit' : 'visits'}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.toiletNoReviews, { color: c.muted }]}>no reviews yet</Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.toiletBtn, { backgroundColor: c.accent }]}
                onPress={() => showPanel('toilet')}
                activeOpacity={0.8}
              >
                <Text style={[styles.toiletBtnText, { color: c.ctaText ?? '#fff' }]}>
                  CA${((biz.toilet_fee_cents ?? 150) / 100).toFixed(2)}  →
                </Text>
              </TouchableOpacity>
            </View>
            {toiletReviews && toiletReviews.reviews.length > 0 && (
              <View style={styles.toiletReviews}>
                {toiletReviews.reviews.map((r: any) => (
                  <View key={r.id} style={[styles.toiletReviewRow, { borderTopColor: c.border }]}>
                    <Text style={[styles.toiletReviewStars, { color: c.accent }]}>{'★'.repeat(r.rating)}</Text>
                    {!!r.review_note && (
                      <Text style={[styles.toiletReviewNote, { color: c.muted }]} numberOfLines={2}>{r.review_note}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Tonight's picks — restaurant menu recommendations from real menu items */}
        {biz.type !== 'popup' && (
          <TouchableOpacity
            style={[styles.menuCard, { borderColor: c.border }]}
            onPress={() => showPanel('reservation-discovery')}
            activeOpacity={0.8}
          >
            <Text style={[styles.menuCardLabel, { color: c.muted }]}>SPONSORED DINNERS</Text>
            <Text style={[styles.menuCardText, { color: c.text }]}>
              See if this restaurant has a hosted dinner available →
            </Text>
          </TouchableOpacity>
        )}

        {/* Personalized menu — restaurant/spa properties */}
        {biz.type !== 'popup' && (
          <TouchableOpacity
            style={[styles.menuCard, { borderColor: c.accent }]}
            onPress={() => showPanel('personalized-menu', { businessId: biz.id, businessName: biz.name })}
            activeOpacity={0.8}
          >
            <Text style={[styles.menuCardLabel, { color: c.accent }]}>DOROTKA MENU</Text>
            <Text style={[styles.menuCardText, { color: c.text }]}>
              Build a tasting menu calibrated to your biometrics →
            </Text>
          </TouchableOpacity>
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
              Portrait shoot · Book via Instagram
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

        {/* Campaign portrait rails */}
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : campaignKeys.length > 0 && (
          <View style={styles.portraitsSection}>
            <Text style={[styles.sectionLabel, { color: c.muted, paddingHorizontal: SPACING.md }]}>CAMPAIGNS</Text>
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

  socialRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACING.lg,
  },
  socialStat: { alignItems: 'center', minWidth: 48 },
  socialStatNum: { fontSize: 22, fontFamily: fonts.playfair },
  socialStatLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginTop: 2 },

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

  jobsSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  jobRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  jobTitle: { fontSize: 15, fontFamily: fonts.playfair },
  jobPay: { fontSize: 11, fontFamily: fonts.dmMono, marginTop: 2 },
  jobArrow: { fontSize: 16 },

  toiletSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  toiletHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toiletRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  toiletRating: { fontSize: 14, letterSpacing: 1 },
  toiletRatingCount: { fontSize: 10, fontFamily: fonts.dmMono },
  toiletNoReviews: { fontSize: 11, fontFamily: fonts.dmSans, fontStyle: 'italic', marginTop: 4 },
  toiletBtn: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  toiletBtnText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  toiletReviews: { gap: 0 },
  toiletReviewRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 3 },
  toiletReviewStars: { fontSize: 12, letterSpacing: 1 },
  toiletReviewNote: { fontSize: 12, fontFamily: fonts.dmSans },

  menuCard: {
    marginHorizontal: SPACING.md, marginTop: SPACING.md,
    borderRadius: 10, borderWidth: 1,
    padding: SPACING.md, gap: 6,
  },
  menuCardLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 2 },
  menuCardText: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20 },

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
});
