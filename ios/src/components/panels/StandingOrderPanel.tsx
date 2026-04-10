import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchBatchPreferences, saveBatchPreference, updateBatchPreference, deleteBatchPreference } from '../../lib/api';

const CHOC_OPTS = [
  { value: 'guanaja_70', label: 'Guanaja 70%' },
  { value: 'caraibe_66', label: 'Caraïbe 66%' },
  { value: 'jivara_40', label: 'Jivara 40%' },
  { value: 'ivoire_blanc', label: 'Ivoire Blanc' },
];
const FINISH_OPTS = [
  { value: 'plain', label: 'Plain' },
  { value: 'fleur_de_sel', label: 'Fleur de Sel' },
  { value: 'or_fin', label: 'Or Fin' },
];
const QTY_OPTS = [1, 2, 4, 6];

export default function BatchPreferencePanel() {
  const { goBack, activeLocation, varieties } = usePanel();
  const c = useColors();

  const [preferences, setPreferences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [selectedVariety, setSelectedVariety] = useState<number | null>(null);
  const [chocolate, setChocolate] = useState('guanaja_70');
  const [finish, setFinish] = useState('plain');
  const [quantity, setQuantity] = useState(2);

  useEffect(() => {
    fetchBatchPreferences()
      .then(setPreferences)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!selectedVariety || !activeLocation?.id) return;
    setSaving(true);
    try {
      const updated = await saveBatchPreference({
        variety_id: selectedVariety,
        chocolate,
        finish,
        quantity,
        location_id: activeLocation.id,
      });
      setPreferences(prev => {
        const idx = prev.findIndex(p => p.id === updated.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
        return [...prev, updated];
      });
      setSelectedVariety(null);
    } catch {
      Alert.alert('Could not save preference', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (pref: any) => {
    const next = pref.status === 'active' ? 'paused' : 'active';
    try {
      const updated = await updateBatchPreference(pref.id, next);
      setPreferences(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch { Alert.alert('Could not update preference.'); }
  };

  const handleDelete = async (pref: any) => {
    Alert.alert('Remove preference?', `Stop auto-including you in ${pref.variety_name} batches?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await deleteBatchPreference(pref.id);
          setPreferences(prev => prev.filter(p => p.id !== pref.id));
        } catch { Alert.alert('Could not remove preference.'); }
      }},
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Batch Preferences</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Existing preferences */}
            {preferences.length > 0 && (
              <View style={{ paddingHorizontal: SPACING.md, paddingTop: SPACING.md }}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>YOUR PREFERENCES</Text>
                {preferences.map(pref => (
                  <View key={pref.id} style={[styles.prefRow, { borderBottomColor: c.border }]}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[styles.prefVariety, { color: c.text }]}>{pref.variety_name}</Text>
                      <Text style={[styles.prefMeta, { color: c.muted }]}>
                        {CHOC_OPTS.find(c => c.value === pref.chocolate)?.label} · {FINISH_OPTS.find(f => f.value === pref.finish)?.label} · ×{pref.quantity}
                      </Text>
                    </View>
                    <View style={styles.prefActions}>
                      <TouchableOpacity onPress={() => handleToggle(pref)} activeOpacity={0.7}
                        style={[styles.prefToggle, { borderColor: c.border }]}>
                        <Text style={[styles.prefToggleText, { color: pref.status === 'active' ? c.accent : c.muted }]}>
                          {pref.status === 'active' ? 'Active' : 'Paused'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(pref)} activeOpacity={0.7}>
                        <Text style={[styles.prefDelete, { color: c.muted }]}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Add new preference */}
            <View style={{ paddingHorizontal: SPACING.md, paddingTop: SPACING.md }}>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>ADD PREFERENCE</Text>

              <Text style={[styles.fieldLabel, { color: c.muted }]}>VARIETY</Text>
              {varieties.map(v => (
                <TouchableOpacity key={v.id} onPress={() => setSelectedVariety(v.id)}
                  style={[styles.optRow, { borderColor: c.border }, selectedVariety === v.id && { borderColor: c.accent }]}
                  activeOpacity={0.75}>
                  <Text style={[styles.optText, { color: selectedVariety === v.id ? c.accent : c.text }]}>{v.name}</Text>
                </TouchableOpacity>
              ))}

              <Text style={[styles.fieldLabel, { color: c.muted, marginTop: 14 }]}>CHOCOLATE</Text>
              <View style={styles.pillRow}>
                {CHOC_OPTS.map(o => (
                  <TouchableOpacity key={o.value} onPress={() => setChocolate(o.value)}
                    style={[styles.pill, { borderColor: c.border }, chocolate === o.value && { borderColor: c.accent }]}
                    activeOpacity={0.75}>
                    <Text style={[styles.pillText, { color: chocolate === o.value ? c.accent : c.muted }]}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: c.muted, marginTop: 14 }]}>FINISH</Text>
              <View style={styles.pillRow}>
                {FINISH_OPTS.map(o => (
                  <TouchableOpacity key={o.value} onPress={() => setFinish(o.value)}
                    style={[styles.pill, { borderColor: c.border }, finish === o.value && { borderColor: c.accent }]}
                    activeOpacity={0.75}>
                    <Text style={[styles.pillText, { color: finish === o.value ? c.accent : c.muted }]}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: c.muted, marginTop: 14 }]}>BOXES PER BATCH</Text>
              <View style={styles.pillRow}>
                {QTY_OPTS.map(q => (
                  <TouchableOpacity key={q} onPress={() => setQuantity(q)}
                    style={[styles.pill, { borderColor: c.border }, quantity === q && { borderColor: c.accent }]}
                    activeOpacity={0.75}>
                    <Text style={[styles.pillText, { color: quantity === q ? c.accent : c.muted }]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: selectedVariety ? c.accent : c.border }, saving && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={!selectedVariety || saving}
                activeOpacity={0.8}
              >
                <Text style={[styles.saveBtnText, { color: c.ctaText ?? '#fff' }]}>
                  {saving ? 'Saving…' : 'Save Preference'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 48 }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { width: 40, paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },
  headerSpacer: { width: 40 },
  body: { flex: 1 },
  sectionLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginBottom: 12 },
  fieldLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginBottom: 8 },
  prefRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  prefVariety: { fontSize: 15, fontFamily: fonts.playfair },
  prefMeta: { fontSize: 11, fontFamily: fonts.dmSans },
  prefActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  prefToggle: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  prefToggleText: { fontSize: 11, fontFamily: fonts.dmMono },
  prefDelete: { fontSize: 16, paddingHorizontal: 4 },
  optRow: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  optText: { fontSize: 15, fontFamily: fonts.playfair },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { fontSize: 12, fontFamily: fonts.dmSans },
  saveBtn: { marginTop: 24, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontFamily: fonts.dmSans },
});
