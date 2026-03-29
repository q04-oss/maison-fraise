import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TIME_SLOTS, getDateOptions } from '../../data/seed';
import { useOrder } from '../../context/OrderContext';
import { COLORS, SPACING } from '../../theme';
import { OrderStackParamList } from '../../types';
import StepLayout from '../../components/StepLayout';

type Nav = NativeStackNavigationProp<OrderStackParamList, 'Step6When'>;

const DATE_OPTIONS = getDateOptions();

export default function Step6WhenScreen() {
  const navigation = useNavigation<Nav>();
  const { order, setDate, setTimeSlot } = useOrder();

  const [selectedDateIdx, setSelectedDateIdx] = useState<number | null>(null);

  const handleSelectDate = (idx: number) => {
    setSelectedDateIdx(idx);
    const d = DATE_OPTIONS[idx];
    setDate(`${d.dayName} ${d.dayNum}`);
    setTimeSlot(null);
  };

  return (
    <StepLayout
      step={6}
      title="When"
      onBack={() => navigation.goBack()}
      onContinue={() => navigation.navigate('Step7Review')}
      continueLabel="Continue to Review"
      canContinue={!!order.date && !!order.timeSlot}
    >
      <View style={styles.container}>
        <Text style={styles.instruction}>
          Choose your delivery window. Same-day orders only.
        </Text>

        {/* Date row */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DATE</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateRow}
          >
            {DATE_OPTIONS.map((d, idx) => {
              const selected = selectedDateIdx === idx;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.dateChip, selected && styles.dateChipSelected]}
                  onPress={() => handleSelectDate(idx)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.dateLabel, selected && styles.textWhite]}
                  >
                    {d.label}
                  </Text>
                  <Text
                    style={[styles.dateNum, selected && styles.textWhite]}
                  >
                    {d.dayNum}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Time grid */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TIME</Text>
          <View style={styles.timeGrid}>
            {TIME_SLOTS.map((slot) => {
              const selected = order.timeSlot?.time === slot.time;
              return (
                <TouchableOpacity
                  key={slot.time}
                  style={[
                    styles.timeChip,
                    selected && styles.timeChipSelected,
                  ]}
                  onPress={() => setTimeSlot(slot)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.timeText, selected && styles.textWhite]}
                  >
                    {slot.time}
                  </Text>
                  <Text
                    style={[
                      styles.slotsText,
                      selected && styles.textWhiteMuted,
                    ]}
                  >
                    {slot.slots} slots
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.md,
    gap: SPACING.lg,
  },
  instruction: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  section: { gap: SPACING.sm },
  sectionLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  dateRow: {
    gap: SPACING.sm,
    paddingVertical: 2,
  },
  dateChip: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 52,
  },
  dateChipSelected: { backgroundColor: COLORS.forestGreen },
  dateLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dateNum: {
    fontSize: 20,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: COLORS.textDark,
    marginTop: 2,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  timeChip: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    width: '31%',
    gap: 3,
  },
  timeChipSelected: { backgroundColor: COLORS.forestGreen },
  timeText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  slotsText: { fontSize: 11, color: COLORS.textMuted },
  textWhite: { color: COLORS.white },
  textWhiteMuted: { color: 'rgba(255,255,255,0.6)' },
});
