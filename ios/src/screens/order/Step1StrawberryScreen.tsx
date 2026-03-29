import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STRAWBERRIES, Strawberry } from '../../data/seed';
import { useOrder } from '../../context/OrderContext';
import { COLORS, SPACING } from '../../theme';
import { OrderStackParamList } from '../../types';
import ProgressBar from '../../components/ProgressBar';

type Nav = NativeStackNavigationProp<OrderStackParamList, 'Step1Strawberry'>;

function StrawberryOption({
  strawberry,
  selected,
  onSelect,
}: {
  strawberry: Strawberry;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.option,
        selected && styles.optionSelected,
        strawberry.tag === 'GREENHOUSE' && !selected && styles.optionHighlighted,
      ]}
      onPress={onSelect}
      activeOpacity={0.85}
    >
      <View style={styles.optionHeader}>
        <View style={styles.optionTitleRow}>
          <Text style={[styles.optionFlag]}>{strawberry.flag}</Text>
          <Text
            style={[
              styles.optionName,
              selected && styles.textWhite,
            ]}
          >
            {strawberry.name}
          </Text>
          {strawberry.tag && (
            <View
              style={[
                styles.badge,
                selected ? styles.badgeWhite : styles.badgeGreen,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  selected ? styles.badgeTextDark : styles.badgeTextGreen,
                ]}
              >
                {strawberry.tag}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.optionPrice, selected && styles.textWhite]}>
          CA${strawberry.price.toFixed(2)}
        </Text>
      </View>
      <Text style={[styles.optionFarm, selected && styles.textWhiteMuted]}>
        {strawberry.farm}
      </Text>
      <Text style={[styles.optionDesc, selected && styles.textWhite]}>
        {strawberry.description}
      </Text>
    </TouchableOpacity>
  );
}

export default function Step1StrawberryScreen() {
  const navigation = useNavigation<Nav>();
  const { order, setStrawberry } = useOrder();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    navigation.getParent()?.navigate('Board' as never);
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <ProgressBar current={1} total={7} />
        <Text style={styles.stepLabel}>STEP 1 OF 7</Text>
        <Text style={styles.stepTitle}>Strawberry</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {STRAWBERRIES.map((s) => (
          <StrawberryOption
            key={s.id}
            strawberry={s}
            selected={order.strawberry?.id === s.id}
            onSelect={() => setStrawberry(s)}
          />
        ))}
      </ScrollView>

      {/* Continue */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <TouchableOpacity
          style={[
            styles.continueBtn,
            !order.strawberry && styles.continueBtnDisabled,
          ]}
          onPress={
            order.strawberry
              ? () => navigation.navigate('Step2Chocolate')
              : undefined
          }
          activeOpacity={order.strawberry ? 0.82 : 1}
        >
          <Text style={styles.continueBtnText}>Continue to Chocolate  →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.forestGreen,
    paddingBottom: 22,
  },
  backBtn: { paddingHorizontal: 20, paddingVertical: 6 },
  backText: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  stepLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginTop: 2,
  },
  stepTitle: {
    color: COLORS.white,
    fontSize: 30,
    fontFamily: 'PlayfairDisplay_700Bold',
    paddingHorizontal: 20,
    marginTop: 4,
  },
  list: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  option: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    gap: 6,
  },
  optionSelected: {
    backgroundColor: COLORS.forestGreen,
  },
  optionHighlighted: {
    backgroundColor: '#F5E8C8',
    borderWidth: 1.5,
    borderColor: 'rgba(196,151,58,0.4)',
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  optionFlag: { fontSize: 15 },
  optionName: {
    fontSize: 17,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: COLORS.textDark,
  },
  optionPrice: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  optionFarm: { fontSize: 12, color: COLORS.textMuted },
  optionDesc: {
    fontSize: 13,
    color: COLORS.textDark,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
  },
  badgeGreen: { backgroundColor: COLORS.greenBadgeBg },
  badgeWhite: { backgroundColor: 'rgba(255,255,255,0.22)' },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  badgeTextGreen: { color: COLORS.greenBadgeText },
  badgeTextDark: { color: COLORS.white },
  textWhite: { color: COLORS.white },
  textWhiteMuted: { color: 'rgba(255,255,255,0.55)' },
  footer: {
    backgroundColor: COLORS.cream,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  continueBtn: {
    backgroundColor: COLORS.forestGreen,
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.35 },
  continueBtnText: {
    color: COLORS.white,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
