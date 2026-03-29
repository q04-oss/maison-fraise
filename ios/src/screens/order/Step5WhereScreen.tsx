import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLLECTION_LOCATIONS, CollectionLocation } from '../../data/seed';
import { useOrder } from '../../context/OrderContext';
import { COLORS, SPACING } from '../../theme';
import { OrderStackParamList } from '../../types';
import StepLayout from '../../components/StepLayout';

type Nav = NativeStackNavigationProp<OrderStackParamList, 'Step5Where'>;

export default function Step5WhereScreen() {
  const navigation = useNavigation<Nav>();
  const { order, setLocation } = useOrder();

  return (
    <StepLayout
      step={5}
      title="Collection"
      onBack={() => navigation.goBack()}
      onContinue={() => navigation.navigate('Step6When')}
      continueLabel="Continue to Schedule"
      canContinue={!!order.location}
    >
      <View style={styles.container}>
        <Text style={styles.instruction}>Choose your collection point.</Text>

        {COLLECTION_LOCATIONS.map((loc) => {
          const selected = order.location?.id === loc.id;
          return (
            <TouchableOpacity
              key={loc.id}
              style={[styles.locationCard, selected && styles.locationSelected]}
              onPress={() => setLocation(loc)}
              activeOpacity={0.85}
            >
              <View
                style={[
                  styles.locDot,
                  { backgroundColor: selected ? COLORS.white : COLORS.forestGreen },
                ]}
              />
              <View style={styles.locInfo}>
                <Text
                  style={[styles.locName, selected && styles.textWhite]}
                >
                  {loc.name}
                </Text>
                <Text
                  style={[styles.locDetail, selected && styles.textWhiteMuted]}
                >
                  {loc.detail}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  instruction: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  locationCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  locationSelected: {
    backgroundColor: COLORS.forestGreen,
  },
  locDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  locInfo: { flex: 1, gap: 4 },
  locName: {
    fontSize: 18,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: COLORS.textDark,
  },
  locDetail: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  textWhite: { color: COLORS.white },
  textWhiteMuted: { color: 'rgba(255,255,255,0.6)' },
});
