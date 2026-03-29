import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CHOCOLATES, Chocolate } from '../../data/seed';
import { useOrder } from '../../context/OrderContext';
import { COLORS, SPACING } from '../../theme';
import { OrderStackParamList } from '../../types';
import StepLayout from '../../components/StepLayout';

type Nav = NativeStackNavigationProp<OrderStackParamList, 'Step2Chocolate'>;

function ChocolateOption({
  chocolate,
  selected,
  onSelect,
}: {
  chocolate: Chocolate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.option,
        selected && { backgroundColor: chocolate.swatchColor },
      ]}
      onPress={onSelect}
      activeOpacity={0.85}
    >
      <View style={styles.optionInner}>
        {!selected && (
          <View
            style={[styles.swatch, { backgroundColor: chocolate.swatchColor }]}
          />
        )}
        <View style={styles.optionText}>
          <View style={styles.optionNameRow}>
            <Text style={[styles.optionName, selected && styles.textWhite]}>
              {chocolate.name}
            </Text>
            {chocolate.tag && (
              <View
                style={[
                  styles.badge,
                  selected ? styles.badgeWhite : styles.badgeBorder,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    selected ? { color: COLORS.white } : { color: COLORS.textMuted },
                  ]}
                >
                  {chocolate.tag}
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[styles.optionSource, selected && styles.textWhiteMuted]}
          >
            {chocolate.source}
          </Text>
          <Text style={[styles.optionDesc, selected && styles.textWhite]}>
            {chocolate.description}
          </Text>
          <Text
            style={[styles.optionTagline, selected && styles.textWhiteMuted]}
          >
            {chocolate.tagline}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function Step2ChocolateScreen() {
  const navigation = useNavigation<Nav>();
  const { order, setChocolate } = useOrder();

  return (
    <StepLayout
      step={2}
      title="Chocolate"
      onBack={() => navigation.goBack()}
      onContinue={() => navigation.navigate('Step3Finish')}
      continueLabel="Continue to Finish"
      canContinue={!!order.chocolate}
    >
      <View style={styles.list}>
        {CHOCOLATES.map((c) => (
          <ChocolateOption
            key={c.id}
            chocolate={c}
            selected={order.chocolate?.id === c.id}
            onSelect={() => setChocolate(c)}
          />
        ))}
      </View>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  option: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
  },
  optionInner: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginTop: 2,
  },
  optionText: { flex: 1, gap: 3 },
  optionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  optionName: {
    fontSize: 17,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: COLORS.textDark,
  },
  optionSource: { fontSize: 12, color: COLORS.textMuted },
  optionDesc: {
    fontSize: 14,
    color: COLORS.textDark,
    fontStyle: 'italic',
    lineHeight: 20,
    marginTop: 2,
  },
  optionTagline: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  badgeBorder: {
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  badgeWhite: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  badgeText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
  textWhite: { color: COLORS.white },
  textWhiteMuted: { color: 'rgba(255,255,255,0.55)' },
});
