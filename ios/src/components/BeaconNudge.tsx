import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { useColors, fonts } from '../theme';
import { usePanel } from '../context/PanelContext';
import { setOnNearbyShop } from '../lib/beaconService';
import { fetchProximityContext, fetchProximityAdCampaign, createAdImpression, respondToAdImpression } from '../lib/api';

export default function BeaconNudge() {
  const c = useColors();
  const { showPanel } = usePanel();
  const [nudge, setNudge] = useState<{ shopUserId: number; shopName: string; businessId: number } | null>(null);
  const [proximityMessage, setProximityMessage] = useState<string | null>(null);
  const [hasVisited, setHasVisited] = useState(false);
  const [adCampaign, setAdCampaign] = useState<any | null>(null);
  const [impressionId, setImpressionId] = useState<number | null>(null);
  const [responding, setResponding] = useState(false);
  const [responded, setResponded] = useState(false);
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOnNearbyShop((shopUserId, shopName, businessId) => {
      setNudge({ shopUserId, shopName, businessId });
      setAdCampaign(null);
      setImpressionId(null);
      setResponded(false);

      fetchProximityContext(businessId)
        .then(ctx => {
          setHasVisited(ctx.hasVisited);
          setProximityMessage(ctx.proximityMessage);
        })
        .catch(() => {});

      fetchProximityAdCampaign(businessId)
        .then(async (campaign) => {
          if (!campaign) return;
          setAdCampaign(campaign);
          // Create a pending impression
          const { impression_id } = await createAdImpression(campaign.id).catch(() => ({ impression_id: null })) as any;
          if (impression_id) setImpressionId(impression_id);
        })
        .catch(() => {});
    });
    return () => setOnNearbyShop(null);
  }, []);

  useEffect(() => {
    if (nudge) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      // Give more time if there's an ad to respond to
      dismissTimer.current = setTimeout(dismiss, adCampaign ? 15000 : 6000);
    }
  }, [nudge, adCampaign]);

  const dismiss = () => {
    Animated.timing(slideAnim, { toValue: -100, duration: 280, useNativeDriver: true }).start(() => {
      setNudge(null);
      setAdCampaign(null);
      setImpressionId(null);
      setResponded(false);
    });
  };

  const handleTap = () => {
    if (!nudge || adCampaign) return;
    dismiss();
  };

  const handleAdRespond = async (accepted: boolean) => {
    if (!impressionId || responding) return;
    setResponding(true);
    try {
      await respondToAdImpression(impressionId, accepted);
      setResponded(true);
      setTimeout(dismiss, 1500);
    } catch {
      setResponding(false);
    }
  };

  if (!nudge) return null;

  return (
    <Animated.View style={[styles.container, { backgroundColor: c.card, borderColor: c.border, transform: [{ translateY: slideAnim }] }]}>
      {adCampaign && impressionId ? (
        /* Ad offer mode */
        <View style={styles.adInner}>
          <View style={styles.adTop}>
            <Text style={[styles.adLabel, { color: c.accent }]}>ad offer · CA${(adCampaign.value_cents / 100).toFixed(2)} if you accept</Text>
            <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.dismissText, { color: c.muted }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.adTitle, { color: c.text }]}>{adCampaign.title}</Text>
          <Text style={[styles.adBody, { color: c.muted }]}>{adCampaign.body}</Text>
          {responded ? (
            <Text style={[styles.respondedText, { color: c.accent }]}>thanks for responding</Text>
          ) : (
            <View style={styles.adButtons}>
              <TouchableOpacity
                style={[styles.adBtn, styles.denyBtn, { borderColor: c.border }]}
                onPress={() => handleAdRespond(false)}
                disabled={responding}
                activeOpacity={0.7}
              >
                <Text style={[styles.adBtnText, { color: c.muted }]}>deny</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.adBtn, styles.acceptBtn, { backgroundColor: c.accent }]}
                onPress={() => handleAdRespond(true)}
                disabled={responding}
                activeOpacity={0.7}
              >
                {responding ? (
                  <ActivityIndicator color={c.ctaText ?? '#fff'} size="small" />
                ) : (
                  <Text style={[styles.adBtnText, { color: c.ctaText ?? '#fff' }]}>accept</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        /* Regular proximity nudge */
        <>
          <TouchableOpacity style={styles.inner} onPress={handleTap} activeOpacity={0.85}>
            <View style={styles.left}>
              <Text style={[styles.label, { color: c.accent }]}>nearby</Text>
              <Text style={[styles.name, { color: c.text }]}>{nudge.shopName}</Text>
              {hasVisited && proximityMessage
                ? <Text style={[styles.hint, { color: c.muted }]}>{proximityMessage}</Text>
                : <Text style={[styles.hint, { color: c.muted }]}>tap to see today's offer</Text>
              }
            </View>
            <Text style={[styles.arrow, { color: c.accent }]}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissBtn} onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.dismissText, { color: c.muted }]}>✕</Text>
          </TouchableOpacity>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 100,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  left: { flex: 1, gap: 2 },
  label: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, textTransform: 'uppercase' },
  name: { fontSize: 16, fontFamily: fonts.playfair },
  hint: { fontSize: 11, fontFamily: fonts.dmSans },
  arrow: { fontSize: 20, fontFamily: fonts.dmMono },
  dismissBtn: { position: 'absolute', top: 10, right: 12 },
  dismissText: { fontSize: 12, fontFamily: fonts.dmMono },
  // Ad mode
  adInner: { padding: 16, gap: 8 },
  adTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  adLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  adTitle: { fontSize: 16, fontFamily: fonts.playfair },
  adBody: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 18 },
  adButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  adBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  denyBtn: { borderWidth: StyleSheet.hairlineWidth },
  acceptBtn: {},
  adBtnText: { fontSize: 13, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  respondedText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5, textAlign: 'center', marginTop: 4 },
});
