import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchFarmVisits, bookFarmVisit, cancelFarmVisitBooking } from '../../lib/api';

export default function FarmVisitsPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);

  useEffect(() => {
    fetchFarmVisits()
      .then(setVisits)
      .catch(() => setVisits([]))
      .finally(() => setLoading(false));
  }, []);

  const handleBook = async (id: number) => {
    setActing(id);
    try {
      await bookFarmVisit(id);
      setVisits(vs => vs.map(v => v.id === id ? { ...v, user_booked: true, participant_count: (v.participant_count ?? 0) + 1 } : v));
    } catch { } finally { setActing(null); }
  };

  const handleCancel = async (id: number) => {
    setActing(id);
    try {
      await cancelFarmVisitBooking(id);
      setVisits(vs => vs.map(v => v.id === id ? { ...v, user_booked: false, participant_count: Math.max(0, (v.participant_count ?? 1) - 1) } : v));
    } catch { } finally { setActing(null); }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>FARM VISITS</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading && (
        <View style={styles.center}><ActivityIndicator color={c.accent} /></View>
      )}

      {!loading && visits.length === 0 && (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>No farm visits scheduled.</Text>
        </View>
      )}

      {!loading && (
        <FlatList
          data={visits}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const spotsLeft = (item.max_participants ?? 0) - (item.participant_count ?? 0);
            const booked = item.user_booked;
            return (
              <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.farmName, { color: c.text, fontFamily: fonts.playfair }]}>{item.farm_name ?? 'Farm Visit'}</Text>
                {item.visit_date && (
                  <Text style={[styles.date, { color: c.muted, fontFamily: fonts.dmMono }]}>
                    {new Date(item.visit_date).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </Text>
                )}
                {item.description ? (
                  <Text style={[styles.desc, { color: c.muted, fontFamily: fonts.dmSans }]} numberOfLines={2}>{item.description}</Text>
                ) : null}
                <View style={styles.footer}>
                  <Text style={[styles.spots, { color: spotsLeft <= 0 ? '#EF4444' : c.muted, fontFamily: fonts.dmMono }]}>
                    {spotsLeft > 0 ? `${spotsLeft} spots left` : 'Full'}
                  </Text>
                  {booked ? (
                    <TouchableOpacity
                      style={[styles.cancelBtn, acting === item.id && { opacity: 0.6 }]}
                      onPress={() => handleCancel(item.id)}
                      disabled={acting === item.id}
                      activeOpacity={0.8}
                    >
                      {acting === item.id ? (
                        <ActivityIndicator color="#EF4444" size="small" />
                      ) : (
                        <Text style={[styles.cancelText, { fontFamily: fonts.dmMono }]}>CANCEL</Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.bookBtn, { backgroundColor: c.accent }, (spotsLeft <= 0 || acting === item.id) && { opacity: 0.6 }]}
                      onPress={() => handleBook(item.id)}
                      disabled={spotsLeft <= 0 || acting === item.id}
                      activeOpacity={0.8}
                    >
                      {acting === item.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={[styles.bookText, { fontFamily: fonts.dmMono }]}>BOOK →</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { fontSize: 28 },
  title: { fontSize: 14, letterSpacing: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 14 },
  list: { padding: SPACING.md, gap: SPACING.sm },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md, gap: 8 },
  farmName: { fontSize: 22 },
  date: { fontSize: 12, letterSpacing: 0.5 },
  desc: { fontSize: 13, lineHeight: 18 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  spots: { fontSize: 12, letterSpacing: 0.5 },
  bookBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  bookText: { color: '#fff', fontSize: 12, letterSpacing: 1 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  cancelText: { color: '#EF4444', fontSize: 12, letterSpacing: 1 },
});
