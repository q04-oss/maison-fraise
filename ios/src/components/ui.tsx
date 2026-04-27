import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useColors, fonts, type, SPACING } from '../theme';

// ─── PanelHeader ─────────────────────────────────────────────────────────────

interface PanelHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  children?: React.ReactNode;
}

export function PanelHeader({ title, subtitle, back, onBack, children }: PanelHeaderProps) {
  const c = useColors();
  return (
    <View style={headerStyles.wrap}>
      <Text style={[headerStyles.title, { color: c.text }]}>{title}</Text>
      {subtitle ? <Text style={[headerStyles.subtitle, { color: c.muted }]}>{subtitle}</Text> : null}
      {children}
      {back && (
        <TouchableOpacity onPress={onBack} activeOpacity={0.6} style={headerStyles.back}>
          <Text style={[headerStyles.backText, { color: c.muted }]}>back</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const headerStyles = StyleSheet.create({
  wrap: { paddingHorizontal: SPACING.lg, paddingBottom: 40 },
  back: { marginTop: SPACING.sm },
  backText: { ...type.small },
  title: { ...type.title, marginBottom: 4 },
  subtitle: { ...type.label },
});

// ─── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  style?: object;
}

export function Card({ children, style }: CardProps) {
  const c = useColors();
  return (
    <View style={[cardStyles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>
      {children}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
});

// ─── MetaRow ─────────────────────────────────────────────────────────────────

interface MetaRowProps {
  label: string;
  value: string;
  last?: boolean;
}

export function MetaRow({ label, value, last }: MetaRowProps) {
  const c = useColors();
  return (
    <View style={[metaStyles.row, last ? null : { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      <Text style={[metaStyles.label, { color: c.muted }]}>{label}</Text>
      <Text style={[metaStyles.value, { color: c.text }]}>{value}</Text>
    </View>
  );
}

const metaStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  label: { fontSize: 11, fontFamily: fonts.dmMono },
  value: { fontSize: 11, fontFamily: fonts.dmMono },
});

// ─── PillBadge ───────────────────────────────────────────────────────────────

interface PillBadgeProps {
  label: string;
  color: string;
}

export function PillBadge({ label, color }: PillBadgeProps) {
  return (
    <View style={[pillStyles.badge, { borderColor: color }]}>
      <Text style={[pillStyles.text, { color }]}>{label}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 9,
    fontFamily: fonts.dmMono,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

// ─── ProgressBar ─────────────────────────────────────────────────────────────

interface ProgressBarProps {
  pct: number;
  ready: boolean;
  label?: string;
}

export function ProgressBar({ pct, ready, label }: ProgressBarProps) {
  const c = useColors();
  return (
    <View style={progressStyles.wrap}>
      <View style={[progressStyles.track, { backgroundColor: c.border }]}>
        <View style={[
          progressStyles.fill,
          { width: `${pct}%` as any, backgroundColor: ready ? '#27AE60' : c.text },
        ]} />
      </View>
      {label ? <Text style={[progressStyles.label, { color: c.muted }]}>{label}</Text> : null}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  wrap: { gap: 6 },
  track: { height: 3, borderRadius: 9999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 9999 },
  label: { fontSize: 10, fontFamily: fonts.dmMono },
});

// ─── PrimaryButton ───────────────────────────────────────────────────────────

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function PrimaryButton({ label, onPress, loading, disabled }: PrimaryButtonProps) {
  const c = useColors();
  return (
    <TouchableOpacity
      style={[btnStyles.btn, { backgroundColor: c.text }]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled || loading}
    >
      {loading
        ? <ActivityIndicator color={c.ctaText} />
        : <Text style={[btnStyles.label, { color: c.ctaText }]}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

const btnStyles = StyleSheet.create({
  btn: {
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontFamily: fonts.dmMono,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
