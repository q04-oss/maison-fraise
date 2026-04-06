import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  TextInput,
  Alert,
  Switch,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchAvailablePortraitTokens, createPortraitLicenseRequest } from '../../lib/api';

type Scope = 'in_app' | 'regional_print' | 'global';
const SCOPES: { key: Scope; label: string }[] = [
  { key: 'in_app', label: 'In-App' },
  { key: 'regional_print', label: 'Regional Print' },
  { key: 'global', label: 'Global' },
];
const DURATIONS = [3, 6, 12];

export default function PortraitLicenseRequestPanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();

  const [availableTokens, setAvailableTokens] = useState<any[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);

  const [selectedToken, setSelectedToken] = useState<any>(null);
  const [scope, setScope] = useState<Scope>('in_app');
  const [durationMonths, setDurationMonths] = useState(3);
  const [offeredAmount, setOfferedAmount] = useState('');
  const [message, setMessage] = useState('');
  const [handleVisible, setHandleVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAvailablePortraitTokens()
      .then(setAvailableTokens)
      .catch(() => {})
      .finally(() => setLoadingTokens(false));
  }, []);

  const offeredCents = Math.round((parseFloat(offeredAmount) || 0) * 100);
  const commissionCents = Math.round(offeredCents * 0.2);
  const subjectCents = offeredCents - commissionCents;

  const canSubmit = selectedToken && offeredCents > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await createPortraitLicenseRequest({
        token_id: selectedToken.id,
        scope,
        duration_months: durationMonths,
        business_contributions: [{ id: null, contribution_cents: offeredCents }],
        handle_visible: handleVisible,
        message: message.trim() || undefined,
      });
      Alert.alert('Request sent', 'The token holder will be notified of your license request.');
      goBack();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not send request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>PORTRAIT LICENSING</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Step 1: Select token */}
        <Text style={[styles.stepTitle, { color: c.text }]}>Select a portrait</Text>
        {loadingTokens ? (
          <ActivityIndicator color={c.accent} style={{ marginVertical: SPACING.md }} />
        ) : availableTokens.length === 0 ? (
          <Text style={[styles.emptyNote, { color: c.muted }]}>
            No portraits are currently available for licensing.
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tokenList}
            contentContainerStyle={styles.tokenListContent}
          >
            {availableTokens.map((t: any) => {
              const selected = selectedToken?.id === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.tokenThumbContainer,
                    { borderColor: selected ? c.accent : c.border },
                  ]}
                  onPress={() => setSelectedToken(t)}
                  activeOpacity={0.8}
                >
                  {t.image_url ? (
                    <Image source={{ uri: t.image_url }} style={styles.tokenThumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.tokenThumb, styles.tokenThumbPlaceholder, { backgroundColor: c.border }]} />
                  )}
                  <Text style={[styles.tokenThumbName, { color: c.muted }]} numberOfLines={1}>
                    {t.owner_display_name ?? 'Owner'}
                  </Text>
                  {t.instagram_handle && (
                    <Text style={[styles.tokenThumbHandle, { color: c.muted }]} numberOfLines={1}>
                      @{t.instagram_handle}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {selectedToken && (
          <>
            {/* Step 2: Scope */}
            <Text style={[styles.stepTitle, { color: c.text }]}>License scope</Text>
            <View style={styles.pills}>
              {SCOPES.map(s => (
                <TouchableOpacity
                  key={s.key}
                  style={[
                    styles.pill,
                    { borderColor: c.border, backgroundColor: scope === s.key ? c.accent : 'transparent' },
                  ]}
                  onPress={() => setScope(s.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillText, { color: scope === s.key ? '#fff' : c.muted }]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Step 3: Duration */}
            <Text style={[styles.stepTitle, { color: c.text }]}>Duration</Text>
            <View style={styles.pills}>
              {DURATIONS.map(d => (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.pill,
                    { borderColor: c.border, backgroundColor: durationMonths === d ? c.accent : 'transparent' },
                  ]}
                  onPress={() => setDurationMonths(d)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillText, { color: durationMonths === d ? '#fff' : c.muted }]}>
                    {d} mo
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Step 4: Offered amount */}
            <Text style={[styles.stepTitle, { color: c.text }]}>Offered amount</Text>
            <View style={styles.amountRow}>
              <Text style={[styles.currency, { color: c.muted }]}>CA$</Text>
              <TextInput
                style={[styles.amountInput, { color: c.text, borderColor: c.border }]}
                placeholder="0.00"
                placeholderTextColor={c.muted}
                keyboardType="decimal-pad"
                value={offeredAmount}
                onChangeText={setOfferedAmount}
              />
            </View>

            {offeredCents > 0 && (
              <View style={[styles.breakdown, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: c.muted }]}>Platform (20%)</Text>
                  <Text style={[styles.breakdownValue, { color: c.muted }]}>
                    CA${(commissionCents / 100).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: c.text }]}>To portrait subject (80%)</Text>
                  <Text style={[styles.breakdownValue, { color: c.accent }]}>
                    CA${(subjectCents / 100).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}

            {/* Optional message */}
            <Text style={[styles.stepTitle, { color: c.text }]}>Message (optional)</Text>
            <TextInput
              style={[styles.messageInput, { color: c.text, borderColor: c.border }]}
              placeholder="Tell them why you'd like to feature their portrait..."
              placeholderTextColor={c.muted}
              multiline
              numberOfLines={3}
              value={message}
              onChangeText={setMessage}
            />

            {/* Handle visible toggle */}
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: c.text }]}>Request Instagram handle</Text>
                <Text style={[styles.toggleSub, { color: c.muted }]}>
                  Include their handle in ads if token holder allows
                </Text>
              </View>
              <Switch
                value={handleVisible}
                onValueChange={setHandleVisible}
                trackColor={{ true: c.accent }}
              />
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                { backgroundColor: canSubmit ? c.accent : c.border },
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Send license request</Text>
              )}
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40 },
  backText: { fontSize: 22 },
  title: {
    fontFamily: fonts.dmMono,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  scroll: {
    padding: SPACING.md,
    paddingBottom: 80,
    gap: SPACING.xs,
  },
  stepTitle: {
    fontFamily: fonts.playfair,
    fontSize: 18,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  emptyNote: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    lineHeight: 20,
  },
  tokenList: { marginBottom: SPACING.xs },
  tokenListContent: { gap: SPACING.sm, paddingRight: SPACING.sm },
  tokenThumbContainer: {
    width: 96,
    borderWidth: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  tokenThumb: {
    width: 96,
    height: 120,
  },
  tokenThumbPlaceholder: {},
  tokenThumbName: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    paddingHorizontal: 4,
    paddingTop: 4,
    textAlign: 'center',
  },
  tokenThumbHandle: {
    fontFamily: fonts.dmMono,
    fontSize: 9,
    paddingHorizontal: 4,
    paddingBottom: 4,
    textAlign: 'center',
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: fonts.dmMono,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.xs,
  },
  currency: {
    fontFamily: fonts.dmMono,
    fontSize: 16,
  },
  amountInput: {
    flex: 1,
    fontFamily: fonts.dmMono,
    fontSize: 24,
    borderBottomWidth: 1,
    paddingVertical: 4,
  },
  breakdown: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.sm,
    gap: 4,
    marginBottom: SPACING.xs,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
  },
  breakdownValue: {
    fontFamily: fonts.dmMono,
    fontSize: 13,
  },
  messageInput: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    borderWidth: 1,
    borderRadius: 10,
    padding: SPACING.sm,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: SPACING.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  toggleLabel: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
  },
  toggleSub: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    marginTop: 2,
  },
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  submitBtnText: {
    fontFamily: fonts.dmSans,
    fontSize: 15,
    color: '#fff',
  },
});
