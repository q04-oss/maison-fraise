import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../../context/PanelContext';
import { fetchSlots } from '../../lib/api';
import { getDateOptions } from '../../data/seed';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

const DATE_OPTIONS = getDateOptions();

export default function WhenPanel() {
  const { goBack, showPanel, order, setOrder } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [selectedDateIdx, setSelectedDateIdx] = useState<number | null>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const isToday = order.date === getDateOptions()[0].isoDate;
  const visibleSlots = isToday
    ? slots.filter(slot => {
        const [h, m = 0] = slot.time.split(':').map(Number);
        const slotTime = new Date();
        slotTime.setHours(h, m, 0, 0);
        return slotTime > new Date();
      })
    : slots;

  useEffect(() => { TrueSheet.present('main-sheet', 2); }, []);

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
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>When</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Date picker */}
        <Text style={[styles.sectionLabel, { color: c.muted }]}>DATE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
          {DATE_OPTIONS.map((d, idx) => {
            const sel = selectedDateIdx === idx;
            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.dateChip,
                  { backgroundColor: c.optionCard, borderColor: c.optionCardBorder },
                  sel && { backgroundColor: c.accent, borderColor: 'transparent' },
                ]}
                onPress={() => selectDate(idx)}
                activeOpacity={0.8}
              >
                <Text style={[styles.dateLabel, { color: sel ? 'rgba(255,255,255,0.7)' : c.muted }]}>{d.label}</Text>
                <Text style={[styles.dateNum, { color: sel ? '#fff' : c.text }]}>{d.dayNum}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Time picker */}
        <Text style={[styles.sectionLabel, { color: c.muted }]}>TIME</Text>
        {!order.location_id ? (
          <Text style={[styles.emptyText, { color: c.muted }]}>Select a collection point on the map first.</Text>
        ) : !order.date ? (
          <Text style={[styles.emptyText, { color: c.muted }]}>Select a date above.</Text>
        ) : loadingSlots ? (
          <ActivityIndicator color={c.accent} style={{ marginVertical: 16 }} />
        ) : visibleSlots.length === 0 ? (
          <Text style={[styles.emptyText, { color: c.muted }]}>No slots available for this date.</Text>
        ) : (
          <View style={styles.timeGrid}>
            {visibleSlots.map(slot => {
              const sel = order.time_slot_id === slot.id;
              const available = slot.capacity - slot.booked;
              return (
                <TouchableOpacity
                  key={slot.id}
                  style={[
                    styles.timeChip,
                    { backgroundColor: c.optionCard, borderColor: c.optionCardBorder },
                    sel && { backgroundColor: c.accent, borderColor: 'transparent' },
                    available <= 0 && { opacity: 0.35 },
                  ]}
                  onPress={() => setOrder({ time_slot_id: slot.id, time_slot_time: slot.time })}
                  disabled={available <= 0}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.timeText, { color: sel ? '#fff' : c.text }]}>{slot.time}</Text>
                  <Text style={[styles.slotsText, { color: sel ? 'rgba(255,255,255,0.7)' : c.muted }]}>{available} left</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <View style={{ height: 8 }} />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: c.accent }, !canContinue && styles.ctaDisabled]}
          onPress={() => showPanel('review')}
          disabled={!canContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 22, lineHeight: 28 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, gap: SPACING.lg },
  sectionLabel: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  dateRow: { gap: 8, paddingVertical: 4 },
  dateChip: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    minWidth: 60,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dateLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  dateNum: { fontSize: 24, fontFamily: fonts.playfair, marginTop: 2 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    width: '31%',
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  timeText: { fontSize: 17, fontFamily: fonts.dmSans, fontWeight: '600' },
  slotsText: { fontSize: 11, fontFamily: fonts.dmSans },
  emptyText: { fontSize: 14, fontFamily: fonts.dmSans, fontStyle: 'italic', paddingVertical: 8 },
  footer: { padding: SPACING.md, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  ctaDisabled: { opacity: 0.3 },
  ctaText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700', color: '#FFFFFF' },
});
