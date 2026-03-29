import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLLECTION_LOCATIONS } from '../data/seed';
import { COLORS, SPACING } from '../theme';

export default function WhereScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.label}>WHERE</Text>
        <Text style={styles.title}>{'Find us\nhere.'}</Text>
        <Text style={styles.subtitle}>
          Same-day collection only. Orders close at 16:00.
        </Text>
      </View>

      <View style={styles.content}>
        {COLLECTION_LOCATIONS.map((loc) => (
          <View key={loc.id} style={styles.locationCard}>
            <View style={styles.locationDot} />
            <View style={styles.locationInfo}>
              <Text style={styles.locationName}>{loc.name}</Text>
              <Text style={styles.locationDetail}>{loc.detail}</Text>
              <Text style={styles.locationHours}>Open 9:00 — 17:00</Text>
            </View>
          </View>
        ))}

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>How it works</Text>
          <Text style={styles.noteText}>
            We dip each strawberry to order. Come during your selected window
            and your box will be ready, still warm.
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
    gap: SPACING.md,
  },
  locationCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.forestGreen,
    marginTop: 5,
  },
  locationInfo: { flex: 1 },
  locationName: {
    fontSize: 18,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  locationDetail: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  locationHours: {
    fontSize: 12,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  noteCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: SPACING.md,
    gap: 8,
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  noteText: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 22,
    fontStyle: 'italic',
  },
});
