import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FINISHES, Finish } from '../../data/seed';
import { useOrder } from '../../context/OrderContext';
import { COLORS, SPACING } from '../../theme';
import { OrderStackParamList } from '../../types';
import StepLayout from '../../components/StepLayout';

type Nav = NativeStackNavigationProp<OrderStackParamList, 'Step3Finish'>;

function FinishOption({
  finish,
  selected,
  onSelect,
}: {
  finish: Finish;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.option, selected && styles.optionSelected]}
      onPress={onSelect}
      activeOpacity={0.85}
    >
      <View style={styles.optionHeader}>
        <Text style={[styles.optionName, selected && styles.textWhite]}>
          {finish.name}
        </Text>
        {finish.tag && (
          <View
            style={[
              styles.badge,
              finish.tag === 'RECOMMENDED'
                ? selected
                  ? styles.badgeWhite
                  : styles.badgeGreen
                : styles.badgeBorder,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                finish.tag === 'RECOMMENDED'
                  ? selected
                    ? { color: COLORS.white }
                    : { color: COLORS.greenBadgeText }
                  : { color: COLORS.textMuted },
              ]}
            >
              {finish.tag}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.optionDesc, selected && styles.textWhite]}>
        {finish.description}
      </Text>
      <Text style={[styles.optionTagline, selected && styles.textWhiteMuted]}>
        {finish.tagline}
      </Text>
    </TouchableOpacity>
  );
}

export default function Step3FinishScreen() {
  const navigation = useNavigation<Nav>();
  const { order, setFinish } = useOrder();

  return (
    <StepLayout
      step={3}
      title="Finish"
      onBack={() => navigation.goBack()}
      onContinue={() => navigation.navigate('Step4Quantity')}
      continueLabel="Continue to Quantity"
      canContinue={!!order.finish}
    >
      <View style={styles.list}>
        {FINISHES.map((f) => (
          <FinishOption
            key={f.id}
            finish={f}
            selected={order.finish?.id === f.id}
            onSelect={() => setFinish(f)}
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
    gap: 5,
  },
  optionSelected: {
    backgroundColor: COLORS.forestGreen,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionName: {
    fontSize: 17,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: COLORS.textDark,
  },
  optionDesc: {
    fontSize: 14,
    color: COLORS.textDark,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  optionTagline: { fontSize: 12, color: COLORS.textMuted },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeGreen: { backgroundColor: COLORS.greenBadgeBg },
  badgeBorder: { borderWidth: 1, borderColor: COLORS.border },
  badgeWhite: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  textWhite: { color: COLORS.white },
  textWhiteMuted: { color: 'rgba(255,255,255,0.55)' },
});
