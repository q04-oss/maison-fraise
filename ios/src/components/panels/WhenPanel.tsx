import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { fetchSlots } from '../../lib/api';
import { getDateOptions } from '../../data/seed';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

const DATE_OPTIONS = getDateOptions();

export default function WhenPanel() {
  const { goBack, showPanel, order, setOrder } = usePanel();
  const c = useColors();
  const [selectedDateIdx, setSelectedDateIdx] = useState<number | null>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (!order.location_id || !order.date) return;
    setLoadingSlots(true);
    fetchSlots(order.location_id, order.date)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [order.location_id, order.date]);

  const selectDate = (idx: number) => {
    setSelectedDateIdx(idx);
    setOrder({ date: DATE_OPTIONS[idx].isoDate, time_slot_id: null, time_slot_time: null });
  };

  const canContinue = !!order.date && !!order.time_slot_id;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.progress}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={[styles.seg, { backgroundColor: i < 5 ? c.text : c.border }]} />
          ))}
        </View>
        <Text style={[styles.stepLabel, { color: c.muted }]}>STEP 5 OF 7</Text>
        <Text style={[styles.stepTitle, { color: c.text }]}>When</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionLabel, { color: c.muted }]}>DATE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
          {DATE_OPTIONS.map((d, idx) => {
            const sel = selectedDateIdx === idx;
            return (
              <TouchableOpacity
                key={idx}
                style={[styles.dateChip, { backgroundColor: c.optionCard, borderColor: c.optionCardBorder }, sel && { backgroundColor: c.accent, borderColor: 'transparent' }]}
                onPress={() => selectDate(idx)}
                activeOpacity={0.8}
              >
                <Text style={[styles.dateLabel, { color: sel ? 'rgba(255,255,255,0.7)' : c.muted }]}>{d.label}</Text>
                <Text style={[styles.dateNum, { color: sel ? '#fff' : c.text }]}>{d.dayNum}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={[styles.sectionLabel, { color: c.muted }]}>TIME</Text>
        {!order.location_id ? (
          <Text style={[styles.noLocationText, { color: c.muted }]}>Select a collection point on the map first.</Text>
        ) : loadingSlots ? (
          <ActivityIndicator color={c.accent} />
        ) : slots.length === 0 && order.date ? (
          <Text style={[styles.noLocationText, { color: c.muted }]}>No slots available for this date.</Text>
        ) : (
          <View style={styles.timeGrid}>
            {slots.map(slot => {
              const sel = order.time_slot_id === slot.id;
              const available = slot.capacity - slot.booked;
              return (
                <TouchableOpacity
                  key={slot.id}
                  style={[styles.timeChip, { backgroundColor: c.optionCard, borderColor: c.optionCardBorder }, sel && { backgroundColor: c.accent, borderColor: 'transparent' }]}
                  onPress={() => setOrder({ time_slot_id: slot.id, time_slot_time: slot.time })}
                  disabled={available <= 0}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.timeText, { color: sel ? '#fff' : c.text }]}>{slot.time}</Text>
                  <Text style={[styles.slotsText, { color: sel ? 'rgba(255,255,255,0.7)' : c.muted }]}>{available} slots</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <View style={{ height: 8 }} />

      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border }]}>
        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: c.text }, !canContinue && styles.continueBtnDisabled]}
          onPress={() => showPanel('review')}
          disabled={!canContinue}
          activeOpacity={0.8}
        >
          <Text style={[styles.continueBtnText, { color: c.ctaText }]}>Continue</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goBack} activeOpacity={0.6} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: c.accent }]}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: SPACING.md, paddingTop: 8, paddingBottom: 12 },
  progress: { flexDirection: 'row', gap: 3, marginBottom: 10 },
  seg: { flex: 1, height: 3, borderRadius: 1 },
  stepLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginBottom: 2 },
  stepTitle: { fontSize: 32, fontFamily: fonts.playfair },
  body: { paddingHorizontal: SPACING.md, gap: SPACING.md },
  sectionLabel: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  dateRow: { gap: 8, paddingVertical: 4 },
  dateChip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', minWidth: 52, borderWidth: StyleSheet.hairlineWidth },
  dateLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  dateNum: { fontSize: 20, fontFamily: fonts.playfair, marginTop: 2 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', width: '31%', gap: 3, borderWidth: StyleSheet.hairlineWidth },
  timeText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '600' },
  slotsText: { fontSize: 11, fontFamily: fonts.dmSans },
  footer: { padding: SPACING.md, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  continueBtn: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  continueBtnDisabled: { opacity: 0.3 },
  continueBtnText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700' },
  backLink: { alignItems: 'center', paddingVertical: 8 },
  backLinkText: { fontSize: 15, fontFamily: fonts.dmSans },
  noLocationText: { fontSize: 14, fontFamily: fonts.dmSans, fontStyle: 'italic', paddingVertical: 8 },
});
