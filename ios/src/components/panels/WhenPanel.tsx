import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { fetchTimeSlots } from '../../lib/api';
import { getDateOptions } from '../../data/seed';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';

export default function WhenPanel() {
  const { goBack, showPanel, order, setOrder, businesses } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const DATE_OPTIONS = useMemo(() => getDateOptions(), []);
  const [selectedDateIdx, setSelectedDateIdx] = useState<number | null>(() => {
    if (!order.date) return null;
    const idx = DATE_OPTIONS.findIndex(d => d.isoDate === order.date);
    return idx >= 0 ? idx : null;
  });
  const [slots, setSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState(false);

  const activeBiz = businesses.find((b: any) => b.id === order.location_id);
  const isPopup = activeBiz?.type === 'popup';

  useEffect(() => {
    if (isPopup && (activeBiz as any)?.launched_at && !order.date) {
      const date = (activeBiz as any).launched_at.split('T')[0];
      setOrder({ date });
    }
  }, [isPopup]);

  const isToday = order.date === DATE_OPTIONS[0].isoDate;
  const visibleSlots = isToday
    ? slots.filter(slot => {
        const [h, m = 0] = (slot.time ?? '').split(':').map(Number);
        const slotTime = new Date();
        slotTime.setHours(h, m, 0, 0);
        return slotTime > new Date();
      })
    : slots;

  useEffect(() => {
    if (!order.location_id || !order.date) return;
    setLoadingSlots(true);
    setSlotError(false);
    fetchTimeSlots(order.location_id, order.date)
      .then(setSlots)
      .catch(() => { setSlots([]); setSlotError(true); })
      .finally(() => setLoadingSlots(false));
  }, [order.location_id, order.date]);

  const selectDate = (idx: number) => {
    setSelectedDateIdx(idx);
    setOrder({ date: DATE_OPTIONS[idx].isoDate, time_slot_id: null, time_slot_time: null });
  };

  useEffect(() => {
    if (!isPopup || loadingSlots || visibleSlots.length !== 1) return;
    const slot = visibleSlots[0];
    const available = (slot.capacity ?? 0) - (slot.booked ?? 0);
    if (available > 0 && order.time_slot_id !== slot.id) {
      setOrder({ time_slot_id: slot.id, time_slot_time: slot.time?.substring(0, 5) ?? '' });
      showPanel('review');
    }
  }, [isPopup, loadingSlots, visibleSlots.length]);

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

      <View style={styles.body}>
        {/* Date section */}
        {!isPopup && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>DATE</Text>
            <View style={[styles.card, { backgroundColor: c.card }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
                {DATE_OPTIONS.map((d, idx) => {
                  const sel = selectedDateIdx === idx;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.dateChip, sel && { backgroundColor: c.accent }]}
                      onPress={() => selectDate(idx)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dateLabel, { color: sel ? 'rgba(255,255,255,0.7)' : c.muted }]}>{d.label}</Text>
                      <Text style={[styles.dateNum, { color: sel ? '#fff' : c.text }]}>{d.dayNum}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        )}

        {isPopup && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>DATE</Text>
            <View style={[styles.card, { backgroundColor: c.card }]}>
              <View style={styles.popupDateRow}>
                <Text style={[styles.popupDateValue, { color: c.text }]}>
                  {activeBiz && (activeBiz as any).hours
                    ? (activeBiz as any).hours
                    : order.date
                      ? new Date(order.date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })
                      : '—'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Time section */}
        <View style={[styles.section, { flex: 1 }]}>
          <Text style={[styles.sectionLabel, { color: c.muted }]}>TIME</Text>
          <View style={[styles.card, { backgroundColor: c.card, flex: 1 }]}>
            {!order.location_id ? (
              <Text style={[styles.emptyText, { color: c.muted }]}>Select a collection point on the map first.</Text>
            ) : !order.date ? (
              <Text style={[styles.emptyText, { color: c.muted }]}>Select a date above.</Text>
            ) : loadingSlots ? (
              <ActivityIndicator color={c.accent} style={styles.loader} />
            ) : slotError ? (
              <Text style={[styles.emptyText, { color: c.muted }]}>Could not load time slots. Pull down to retry.</Text>
            ) : visibleSlots.length === 0 ? (
              <Text style={[styles.emptyText, { color: c.muted }]}>No slots available for this date.</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {visibleSlots.map((slot, i) => {
                  const sel = order.time_slot_id === slot.id;
                  const available = (slot.capacity ?? 0) - (slot.booked ?? 0);
                  return (
                    <React.Fragment key={slot.id}>
                      {i > 0 && <View style={[styles.divider, { backgroundColor: c.border }]} />}
                      <TouchableOpacity
                        style={[styles.timeRow, available <= 0 && { opacity: 0.35 }]}
                        onPress={() => setOrder({ time_slot_id: slot.id, time_slot_time: slot.time?.substring(0, 5) ?? '' })}
                        disabled={available <= 0}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.timeText, { color: c.text }]}>{slot.time?.substring(0, 5) ?? ''}</Text>
                        <Text style={[styles.availText, { color: c.muted }]}>{available} left</Text>
                        <View style={[styles.radio, { borderColor: sel ? c.accent : c.border }]}>
                          {sel && <View style={[styles.radioDot, { backgroundColor: c.accent }]} />}
                        </View>
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom || SPACING.md }]}>
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
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  body: { flex: 1, paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.md },
  section: { gap: 8 },
  sectionLabel: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1, marginLeft: 4 },
  card: { borderRadius: 12, overflow: 'hidden' },
  popupDateRow: { paddingHorizontal: SPACING.md, paddingVertical: 14 },
  popupDateValue: { fontSize: 15, fontFamily: fonts.playfair },
  dateRow: { flexDirection: 'row', paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, gap: 6 },
  dateChip: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', minWidth: 52 },
  dateLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  dateNum: { fontSize: 22, fontFamily: fonts.playfair, marginTop: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 14, gap: 12 },
  timeText: { fontSize: 17, fontFamily: fonts.playfair, flex: 1 },
  availText: { fontSize: 12, fontFamily: fonts.dmSans },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md },
  emptyText: { fontSize: 13, fontFamily: fonts.dmSans, fontStyle: 'italic', padding: SPACING.md },
  loader: { marginVertical: SPACING.lg },
  footer: { padding: SPACING.md, paddingTop: 12 },
  cta: { borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  ctaDisabled: { opacity: 0.3 },
  ctaText: { fontSize: 16, fontFamily: fonts.dmSans, fontWeight: '700', color: '#FFFFFF' },
});
