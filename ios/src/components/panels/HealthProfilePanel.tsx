import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchHealthProfile, updateHealthProfile } from '../../lib/api';

const RESTRICTIONS = ['vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'nut-free', 'halal', 'kosher'];
const ALLERGENS = ['nuts', 'shellfish', 'fish', 'eggs', 'soy', 'wheat', 'sesame'];

function Bar({ value, label, color }: { value: number; label: string; color: string }) {
  const c = useColors();
  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, { color: c.muted }]}>{label}</Text>
      <View style={[styles.barTrack, { backgroundColor: c.border }]}>
        <View style={[styles.barFill, { width: `${Math.round(value * 100)}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.barValue, { color: c.muted }]}>{Math.round(value * 100)}</Text>
    </View>
  );
}

export default function HealthProfilePanel() {
  const { goBack, showPanel, activeLocation } = usePanel();
  const c = useColors();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try { setProfile(await fetchHealthProfile()); } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleRestriction = async (r: string) => {
    const current: string[] = profile?.dietary_restrictions ?? [];
    const next = current.includes(r) ? current.filter((x: string) => x !== r) : [...current, r];
    setSaving(true);
    try {
      const updated = await updateHealthProfile({ dietary_restrictions: next });
      setProfile(updated);
    } catch { Alert.alert('Error', 'Could not update.'); }
    finally { setSaving(false); }
  };

  const toggleAllergen = async (a: string) => {
    const current: Record<string, boolean> = profile?.allergens ?? {};
    const next = { ...current, [a]: !current[a] };
    setSaving(true);
    try {
      const updated = await updateHealthProfile({ allergens: next });
      setProfile(updated);
    } catch { Alert.alert('Error', 'Could not update.'); }
    finally { setSaving(false); }
  };

  const m = profile?.biometric_markers ?? {};
  const f = profile?.flavor_profile ?? {};
  const restrictions: string[] = profile?.dietary_restrictions ?? [];
  const allergens: Record<string, boolean> = profile?.allergens ?? {};
  const hasRecentReading = !!profile?.last_reading_at;
  const hasBioData = Object.keys(m).length > 0;

  const canGenerateMenu = activeLocation?.type !== 'collection' && activeLocation?.type !== 'popup';

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Health Profile</Text>
        <View style={styles.spacer} />
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Dorotka note */}
          <View style={[styles.dorotkaCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.dorotkaLabel, { color: c.accent }]}>DOROTKA SAYS</Text>
            <Text style={[styles.dorotkaNote, { color: c.text }]}>
              {profile?.dorotka_note || (hasRecentReading
                ? 'Your profile is calibrated. Every menu at a Maison Fraise restaurant is built from this.'
                : 'Connect your home Dorotka toilet to begin biometric calibration. Until then, your menus are built from your dietary preferences below.'
              )}
            </Text>
            {hasRecentReading && (
              <Text style={[styles.dorotkaDate, { color: c.muted }]}>
                Last reading: {new Date(profile.last_reading_at).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}
              </Text>
            )}
          </View>

          {/* Biometric markers */}
          {hasBioData && (
            <>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>BIOMETRICS</Text>
              <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
                {m.gut_microbiome_diversity !== undefined && (
                  <Bar value={m.gut_microbiome_diversity} label="Gut diversity" color="#6BAF7A" />
                )}
                {m.hydration !== undefined && (
                  <Bar value={m.hydration} label="Hydration" color="#5B8DB8" />
                )}
                {m.inflammation_markers !== undefined && (
                  <Bar value={m.inflammation_markers} label="Inflammation" color="#C0392B" />
                )}
                {m.digestive_speed !== undefined && (
                  <Bar value={m.digestive_speed} label="Digestive speed" color="#C9973A" />
                )}
                {m.stress_indicators !== undefined && (
                  <Bar value={m.stress_indicators} label="Stress" color="#8E6BAF" />
                )}
              </View>
            </>
          )}

          {/* Flavor profile */}
          {Object.keys(f).length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: c.muted }]}>FLAVOUR PROFILE</Text>
              <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
                {f.umami !== undefined && <Bar value={f.umami} label="Umami" color="#C9973A" />}
                {f.sweet !== undefined && <Bar value={f.sweet} label="Sweet" color="#E8A0BF" />}
                {f.sour !== undefined && <Bar value={f.sour} label="Sour" color="#6BAF7A" />}
                {f.bitter !== undefined && <Bar value={f.bitter} label="Bitter" color="#5B8DB8" />}
                {f.rich !== undefined && <Bar value={f.rich} label="Rich" color="#C0392B" />}
                {f.spicy !== undefined && <Bar value={f.spicy} label="Spicy" color="#8E6BAF" />}
              </View>
            </>
          )}

          {/* Dietary restrictions */}
          <Text style={[styles.sectionLabel, { color: c.muted }]}>DIETARY</Text>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.pillRow}>
              {RESTRICTIONS.map(r => (
                <TouchableOpacity
                  key={r}
                  onPress={() => toggleRestriction(r)}
                  disabled={saving}
                  activeOpacity={0.7}
                  style={[styles.pill, restrictions.includes(r)
                    ? { backgroundColor: c.accent }
                    : { borderColor: c.border, borderWidth: 1 }
                  ]}
                >
                  <Text style={[styles.pillText, { color: restrictions.includes(r) ? (c.ctaText ?? '#fff') : c.muted }]}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Allergens */}
          <Text style={[styles.sectionLabel, { color: c.muted }]}>ALLERGENS</Text>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.pillRow}>
              {ALLERGENS.map(a => (
                <TouchableOpacity
                  key={a}
                  onPress={() => toggleAllergen(a)}
                  disabled={saving}
                  activeOpacity={0.7}
                  style={[styles.pill, allergens[a]
                    ? { backgroundColor: '#C0392B' }
                    : { borderColor: c.border, borderWidth: 1 }
                  ]}
                >
                  <Text style={[styles.pillText, { color: allergens[a] ? '#fff' : c.muted }]}>
                    no {a}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Generate menu CTA */}
          {canGenerateMenu && (
            <TouchableOpacity
              style={[styles.menuBtn, { backgroundColor: c.accent }]}
              onPress={() => showPanel('personalized-menu', { businessId: activeLocation!.id, businessName: activeLocation!.name })}
              activeOpacity={0.8}
            >
              <Text style={[styles.menuBtnText, { color: c.ctaText ?? '#fff' }]}>
                generate my menu at {activeLocation!.name} →
              </Text>
            </TouchableOpacity>
          )}

          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: 18, paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, paddingVertical: 4 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.playfair, textAlign: 'center' },
  spacer: { width: 40 },
  scroll: { flex: 1, paddingHorizontal: SPACING.md },
  dorotkaCard: {
    marginTop: SPACING.md, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md, gap: 8,
  },
  dorotkaLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 2 },
  dorotkaNote: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 22 },
  dorotkaDate: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  sectionLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 2, marginTop: SPACING.md, marginBottom: 6 },
  card: {
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md, gap: 10,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { fontSize: 11, fontFamily: fonts.dmSans, width: 110 },
  barTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  barValue: { fontSize: 10, fontFamily: fonts.dmMono, width: 28, textAlign: 'right' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  menuBtn: { marginTop: SPACING.lg, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  menuBtnText: { fontSize: 13, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
});
