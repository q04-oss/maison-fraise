import React, { useEffect, useState } from 'react';
import { Text, StyleSheet, Animated, AppState } from 'react-native';
import { useColors, fonts } from '../theme';
import { API_BASE_URL } from '../config/api';

export default function OfflineBanner() {
  const c = useColors();
  const [offline, setOffline] = useState(false);
  const opacity = React.useRef(new Animated.Value(0)).current;

  const check = async () => {
    try {
      await fetch(API_BASE_URL + '/api/varieties', { method: 'HEAD' });
      setOffline(false);
    } catch {
      setOffline(true);
    }
  };

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') check(); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    Animated.timing(opacity, { toValue: offline ? 1 : 0, duration: 300, useNativeDriver: true }).start();
  }, [offline]);

  if (!offline) return null;
  return (
    <Animated.View style={[styles.banner, { backgroundColor: c.card, opacity }]}>
      <Text style={[styles.text, { color: c.muted }]}>No connection</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', top: 0, left: 0, right: 0, paddingVertical: 6, alignItems: 'center', zIndex: 999 },
  text: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1 },
});
