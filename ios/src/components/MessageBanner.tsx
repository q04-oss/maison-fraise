import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, fonts, SPACING } from '../theme';

interface Props {
  senderName: string;
  body: string;
  onTap: () => void;
  onDismiss: () => void;
}

export default function MessageBanner({ senderName, body, onTap, onDismiss }: Props) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    Animated.spring(slideY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 200,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(slideY, {
        toValue: -120,
        duration: 260,
        useNativeDriver: true,
      }).start(() => onDismiss());
    }, 3500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: c.card,
          borderColor: c.border,
          top: insets.top + 8,
          transform: [{ translateY: slideY }],
        },
      ]}
    >
      <TouchableOpacity style={styles.inner} onPress={onTap} activeOpacity={0.85}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>{senderName}</Text>
        <Text style={[styles.body, { color: c.muted }]} numberOfLines={1}>{body}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  inner: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    gap: 3,
  },
  name: { fontSize: 13, fontFamily: fonts.dmSans },
  body: { fontSize: 12, fontFamily: fonts.dmSans },
});
