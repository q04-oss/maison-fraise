import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchItineraries, createItinerary, deleteItinerary } from '../../lib/api';

export default function ItineraryPanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();

  const [loading, setLoading] = useState(true);
  const [itineraries, setItineraries] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItineraries(await fetchItineraries()); } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const created = await createItinerary({ title: newTitle.trim() });
      setItineraries(prev => [{ ...created, destination_count: 0, pending_proposals: 0 }, ...prev]);
      setNewTitle('');
      setShowCreate(false);
      showPanel('itinerary-detail', { itineraryId: created.id });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not create.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (id: number, title: string) => {
    Alert.alert(`Delete "${title}"?`, 'This will remove all destinations.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteItinerary(id).catch(() => {});
          setItineraries(prev => prev.filter(i => i.id !== id));
        },
      },
    ]);
  };

  const dateRange = (it: any): string => {
    // infer range from destinations if available
    return it.destination_count > 0 ? `${it.destination_count} destination${it.destination_count !== 1 ? 's' : ''}` : 'no destinations yet';
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Itineraries</Text>
        <TouchableOpacity onPress={() => setShowCreate(v => !v)} style={styles.newBtn} activeOpacity={0.7}>
          <Text style={[styles.newBtnText, { color: c.accent }]}>{showCreate ? '✕' : '+ new'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {showCreate && (
            <View style={[styles.createCard, { borderColor: c.border }]}>
              <TextInput
                style={[styles.input, { color: c.text, borderColor: c.border }]}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="Itinerary title"
                placeholderTextColor={c.muted}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreate}
                maxLength={80}
              />
              <TouchableOpacity
                style={[styles.createBtn, { backgroundColor: c.accent }, creating && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={creating || !newTitle.trim()}
                activeOpacity={0.8}
              >
                <Text style={[styles.createBtnText, { color: c.ctaText ?? '#fff' }]}>
                  {creating ? 'Creating…' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {itineraries.length === 0 && !showCreate && (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: c.text }]}>No itineraries</Text>
              <Text style={[styles.emptyHint, { color: c.muted }]}>
                Build multi-year international travel plans. Properties will send you bespoke invitations based on where you're going.
              </Text>
            </View>
          )}

          {itineraries.map(it => (
            <TouchableOpacity
              key={it.id}
              style={[styles.itineraryRow, { borderBottomColor: c.border }]}
              onPress={() => showPanel('itinerary-detail', { itineraryId: it.id })}
              onLongPress={() => handleDelete(it.id, it.title)}
              delayLongPress={600}
              activeOpacity={0.7}
            >
              <View style={styles.itineraryLeft}>
                <Text style={[styles.itineraryTitle, { color: c.text }]}>{it.title}</Text>
                <Text style={[styles.itineraryMeta, { color: c.muted }]}>{dateRange(it)}</Text>
                {it.description ? (
                  <Text style={[styles.itineraryDesc, { color: c.muted }]} numberOfLines={1}>{it.description}</Text>
                ) : null}
              </View>
              <View style={styles.itineraryRight}>
                {it.pending_proposals > 0 && (
                  <View style={[styles.proposalBadge, { backgroundColor: c.accent }]}>
                    <Text style={[styles.proposalBadgeText, { color: c.ctaText ?? '#fff' }]}>{it.pending_proposals}</Text>
                  </View>
                )}
                <Text style={[styles.arrow, { color: c.accent }]}>→</Text>
              </View>
            </TouchableOpacity>
          ))}

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
  newBtn: { width: 50, alignItems: 'flex-end' },
  newBtnText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  scroll: { flex: 1, paddingHorizontal: SPACING.md },
  createCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: SPACING.md, marginTop: SPACING.md, gap: 10 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 12, fontSize: 15, fontFamily: fonts.dmSans },
  createBtn: { borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  createBtnText: { fontSize: 13, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  emptyState: { paddingTop: 60, alignItems: 'center', paddingHorizontal: SPACING.md },
  emptyTitle: { fontSize: 20, fontFamily: fonts.playfair, marginBottom: 10 },
  emptyHint: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20, textAlign: 'center' },
  itineraryRow: {
    paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  itineraryLeft: { flex: 1, gap: 3 },
  itineraryTitle: { fontSize: 16, fontFamily: fonts.playfair },
  itineraryMeta: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  itineraryDesc: { fontSize: 12, fontFamily: fonts.dmSans },
  itineraryRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  proposalBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  proposalBadgeText: { fontSize: 10, fontFamily: fonts.dmMono },
  arrow: { fontSize: 16 },
});
