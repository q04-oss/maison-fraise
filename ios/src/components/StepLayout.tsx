import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';
import ProgressBar from './ProgressBar';
import OrderSummaryCard from './OrderSummaryCard';

interface Props {
  step: number;
  title: string;
  children: React.ReactNode;
  onBack: () => void;
  onContinue: () => void;
  continueLabel?: string;
  canContinue?: boolean;
}

const StepLayout: React.FC<Props> = ({
  step,
  title,
  children,
  onBack,
  onContinue,
  continueLabel = 'Continue',
  canContinue = true,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.cream }}>
      {/* Dark green header */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <ProgressBar current={step} total={7} />
        <Text style={styles.stepLabel}>STEP {step} OF 7</Text>
        <Text style={styles.stepTitle}>{title}</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <OrderSummaryCard />
        {children}
      </ScrollView>

      {/* Fixed continue button */}
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 12) + 8 },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.continueBtn,
            !canContinue && styles.continueBtnDisabled,
          ]}
          onPress={canContinue ? onContinue : undefined}
          activeOpacity={canContinue ? 0.82 : 1}
        >
          <Text style={styles.continueBtnText}>{continueLabel}  →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.forestGreen,
    paddingBottom: 22,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  backText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    letterSpacing: 0.3,
  },
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
    lineHeight: 36,
  },
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
    justifyContent: 'center',
  },
  continueBtnDisabled: {
    opacity: 0.35,
  },
  continueBtnText: {
    color: COLORS.white,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});

export default StepLayout;
