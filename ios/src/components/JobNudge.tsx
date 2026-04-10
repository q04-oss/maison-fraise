import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useColors, fonts } from '../theme';
import { usePanel } from '../context/PanelContext';
import { setOnNearbyJob, } from '../lib/beaconService';
import { JobPosting } from '../lib/api';

export default function JobNudge() {
  const c = useColors();
  const { showPanel } = usePanel();
  const [nudge, setNudge] = useState<{ job: JobPosting; businessName: string } | null>(null);
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOnNearbyJob((job, businessName) => {
      setNudge({ job, businessName });
    });
    return () => setOnNearbyJob(null);
  }, []);

  useEffect(() => {
    if (nudge) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(dismiss, 7000);
    }
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [nudge]);

  const dismiss = () => {
    Animated.timing(slideAnim, { toValue: -80, duration: 280, useNativeDriver: true }).start(() => setNudge(null));
  };

  const handleTap = () => {
    if (!nudge) return;
    dismiss();
    showPanel('jobDetail', {
      job: nudge.job,
      businessName: nudge.businessName,
    });
  };

  const formatPay = (job: JobPosting) => {
    const amount = (job.pay_cents / 100).toFixed(0);
    return job.pay_type === 'hourly' ? `$${amount}/hr` : `$${parseInt(amount).toLocaleString()}/yr`;
  };

  if (!nudge) return null;

  return (
    <Animated.View style={[styles.container, { backgroundColor: c.card, borderColor: c.border, transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity style={styles.inner} onPress={handleTap} activeOpacity={0.85}>
        <View style={styles.left}>
          <Text style={[styles.label, { color: c.accent }]}>hiring nearby</Text>
          <Text style={[styles.title, { color: c.text }]}>{nudge.job.title}</Text>
          <Text style={[styles.pay, { color: c.muted }]}>{nudge.businessName}  ·  {formatPay(nudge.job)}</Text>
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
    top: 80,
    left: 16,
    right: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 99,
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
  title: { fontSize: 16, fontFamily: fonts.playfair },
  pay: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  arrow: { fontSize: 20, fontFamily: fonts.dmMono },
  dismissBtn: { position: 'absolute', top: 10, right: 12 },
  dismissText: { fontSize: 12, fontFamily: fonts.dmMono },
});
