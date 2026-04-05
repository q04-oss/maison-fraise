import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useColors, fonts } from '../theme';
import { usePanel } from '../context/PanelContext';
import { setOnNearbyShop } from '../lib/beaconService';
import { fetchProximityContext } from '../lib/api';

export default function BeaconNudge() {
  const c = useColors();
  const { showPanel, setPanelData } = usePanel();
  const [nudge, setNudge] = useState<{ shopUserId: number; shopName: string; businessId: number } | null>(null);
  const [proximityMessage, setProximityMessage] = useState<string | null>(null);
  const [hasVisited, setHasVisited] = useState(false);
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOnNearbyShop((shopUserId, shopName, businessId) => {
      setNudge({ shopUserId, shopName, businessId });
      fetchProximityContext(businessId)
        .then(ctx => {
          setHasVisited(ctx.hasVisited);
          setProximityMessage(ctx.proximityMessage);
        })
        .catch(() => {});
    });
    return () => setOnNearbyShop(null);
  }, []);

  useEffect(() => {
    if (nudge) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(dismiss, 6000);
    }
  }, [nudge]);

  const dismiss = () => {
    Animated.timing(slideAnim, { toValue: -80, duration: 280, useNativeDriver: true }).start(() => setNudge(null));
  };

  const handleTap = () => {
    if (!nudge) return;
    dismiss();
    showPanel('messageThread', {
      userId: nudge.shopUserId,
      displayName: nudge.shopName,
      isShop: true,
      businessId: nudge.businessId,
    });
  };

  if (!nudge) return null;

  return (
    <Animated.View style={[styles.container, { backgroundColor: c.card, borderColor: c.border, transform: [{ translateY: slideAnim }] }]}>
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
});
