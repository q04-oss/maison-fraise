import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../theme';

export default function EventsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.label}>EVENTS</Text>
        <Text style={styles.title}>{'Coming\nsoon.'}</Text>
        <Text style={styles.subtitle}>
          Private tastings, seasonal launches, and more.
        </Text>
      </View>

      <View style={styles.content}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nothing scheduled.</Text>
          <Text style={styles.emptyText}>
            Follow along for announcements on upcoming events and limited
            releases.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.forestGreen,
    paddingHorizontal: SPACING.md,
    paddingBottom: 28,
  },
  label: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    color: COLORS.white,
    fontSize: 40,
    fontFamily: 'PlayfairDisplay_700Bold',
    lineHeight: 46,
    marginBottom: 10,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 13,
    fontStyle: 'italic',
  },
  content: {
    padding: SPACING.md,
  },
  emptyCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: SPACING.lg,
    gap: 10,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: COLORS.textMuted,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 22,
  },
});
