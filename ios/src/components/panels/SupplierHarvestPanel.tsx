import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchHarvestLogs, createHarvestLog, deleteHarvestLog, fetchVarieties } from '../../lib/api';

export default function SupplierHarvestPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<any[]>([]);
  const [varieties, setVarieties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVarietyId, setSelectedVarietyId] = useState<number | null>(null);
  const [kg, setKg] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([fetchHarvestLogs(), fetchVarieties()])
      .then(([l, v]) => { setLogs(l); setVarieties(v); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!selectedVarietyId || !kg) return;
    setSubmitting(true);
    try {
      const log = await createHarvestLog({ variety_id: selectedVarietyId, kg_harvested: parseFloat(kg), notes: notes.trim() || undefined });
      setLogs(ls => [log, ...ls]);
      setKg('');
      setNotes('');
    } catch { } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await deleteHarvestLog(id);
      setLogs(ls => ls.filter(l => l.id !== id));
    } catch { } finally { setDeleting(null); }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>HARVEST LOG</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading && (
        <View style={styles.center}><ActivityIndicator color={c.accent} /></View>
      )}

      {!loading && (
        <FlatList
          data={logs}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={(
            <View style={[styles.form, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.formLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>LOG HARVEST</Text>
              <View style={styles.varietyPicker}>
                {varieties.map(v => (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.pill, { borderColor: selectedVarietyId === v.id ? c.accent : c.border, backgroundColor: selectedVarietyId === v.id ? c.accent : 'transparent' }]}
                    onPress={() => setSelectedVarietyId(v.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pillText, { color: selectedVarietyId === v.id ? '#fff' : c.muted, fontFamily: fonts.dmMono }]}>{v.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.inputSm, { color: c.text, borderColor: c.border, fontFamily: fonts.dmMono }]}
                  value={kg}
                  onChangeText={setKg}
                  placeholder="kg"
                  placeholderTextColor={c.muted}
                  keyboardType="decimal-pad"
                />
                <TextInput
                  style={[styles.input, { flex: 1, color: c.text, borderColor: c.border, fontFamily: fonts.dmSans }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Notes (optional)"
                  placeholderTextColor={c.muted}
                />
              </View>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: c.accent }, (submitting || !selectedVarietyId || !kg) && { opacity: 0.5 }]}
                onPress={handleSubmit}
                disabled={submitting || !selectedVarietyId || !kg}
                activeOpacity={0.8}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={[styles.btnText, { fontFamily: fonts.dmMono }]}>LOG →</Text>}
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={(
            <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>No harvest logs yet.</Text>
          )}
          renderItem={({ item }) => (
            <View style={[styles.logCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.logRow}>
                <Text style={[styles.logVariety, { color: c.text, fontFamily: fonts.playfair }]}>{item.variety_name ?? `Variety #${item.variety_id}`}</Text>
                <Text style={[styles.logKg, { color: c.accent, fontFamily: fonts.dmMono }]}>{item.kg_harvested} kg</Text>
              </View>
              {item.notes ? <Text style={[styles.logNotes, { color: c.muted, fontFamily: fonts.dmSans }]}>{item.notes}</Text> : null}
              <View style={styles.logRow}>
                <Text style={[styles.logDate, { color: c.muted, fontFamily: fonts.dmMono }]}>
                  {new Date(item.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                <TouchableOpacity onPress={() => handleDelete(item.id)} disabled={deleting === item.id} activeOpacity={0.7}>
                  <Text style={[styles.deleteText, { color: '#EF4444', fontFamily: fonts.dmMono }]}>
                    {deleting === item.id ? '…' : 'DELETE'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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
  list: { padding: SPACING.md, gap: SPACING.sm },
  form: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.sm },
  formLabel: { fontSize: 11, letterSpacing: 1.5 },
  varietyPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  pill: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { fontSize: 12, letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: SPACING.sm },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  inputSm: { width: 70 },
  btn: { alignItems: 'center', paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#fff', fontSize: 13, letterSpacing: 1.5 },
  empty: { fontSize: 14, textAlign: 'center' },
  logCard: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md, gap: 4 },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logVariety: { fontSize: 18 },
  logKg: { fontSize: 16, letterSpacing: 1 },
  logNotes: { fontSize: 12, lineHeight: 16 },
  logDate: { fontSize: 11, letterSpacing: 0.5 },
  deleteText: { fontSize: 11, letterSpacing: 1 },
});
