import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchWebhooks, createWebhook, deleteWebhook, testWebhook } from '../../lib/api';

const EVENTS = ['order.ready', 'pickup.completed', 'standing_order.renewed', 'standing_order.expiring'];

export default function WebhooksPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [testing, setTesting] = useState<number | null>(null);

  useEffect(() => {
    fetchWebhooks()
      .then(setWebhooks)
      .catch(() => setWebhooks([]))
      .finally(() => setLoading(false));
  }, []);

  const toggleEvent = (event: string) => {
    setSelectedEvents(prev =>
      prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]
    );
  };

  const handleCreate = async () => {
    if (!url.trim() || selectedEvents.length === 0) return;
    setCreating(true);
    try {
      const wh = await createWebhook({ url: url.trim(), events: selectedEvents });
      setWebhooks(ws => [wh, ...ws]);
      setUrl('');
      setSelectedEvents([]);
    } catch { } finally { setCreating(false); }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await deleteWebhook(id);
      setWebhooks(ws => ws.filter(w => w.id !== id));
    } catch { } finally { setDeleting(null); }
  };

  const handleTest = async (id: number) => {
    setTesting(id);
    try {
      await testWebhook(id);
    } catch { } finally { setTesting(null); }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>WEBHOOKS</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading && (
        <View style={styles.center}><ActivityIndicator color={c.accent} /></View>
      )}

      {!loading && (
        <FlatList
          data={webhooks}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={(
            <View style={[styles.form, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.formLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>NEW WEBHOOK</Text>
              <TextInput
                style={[styles.input, { color: c.text, borderColor: c.border, fontFamily: fonts.dmMono }]}
                value={url}
                onChangeText={setUrl}
                placeholder="https://your-server.com/hook"
                placeholderTextColor={c.muted}
                autoCapitalize="none"
                keyboardType="url"
              />
              <View style={styles.eventGrid}>
                {EVENTS.map(event => (
                  <TouchableOpacity
                    key={event}
                    style={[styles.eventPill, { borderColor: selectedEvents.includes(event) ? c.accent : c.border, backgroundColor: selectedEvents.includes(event) ? c.accent : 'transparent' }]}
                    onPress={() => toggleEvent(event)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.eventText, { color: selectedEvents.includes(event) ? '#fff' : c.muted, fontFamily: fonts.dmMono }]}>
                      {event}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: c.accent }, (creating || !url.trim() || selectedEvents.length === 0) && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={creating || !url.trim() || selectedEvents.length === 0}
                activeOpacity={0.8}
              >
                {creating ? <ActivityIndicator color="#fff" /> : <Text style={[styles.btnText, { fontFamily: fonts.dmMono }]}>ADD WEBHOOK →</Text>}
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={(
            <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>No webhooks configured.</Text>
          )}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.webhookUrl, { color: c.text, fontFamily: fonts.dmMono }]} numberOfLines={1}>{item.url}</Text>
              <Text style={[styles.events, { color: c.muted, fontFamily: fonts.dmSans }]}>
                {(item.events as string[]).join(', ')}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: c.border }]}
                  onPress={() => handleTest(item.id)}
                  disabled={testing === item.id}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.actionText, { color: c.muted, fontFamily: fonts.dmMono }]}>
                    {testing === item.id ? 'SENDING…' : 'TEST'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: '#EF4444' }]}
                  onPress={() => handleDelete(item.id)}
                  disabled={deleting === item.id}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.actionText, { color: '#EF4444', fontFamily: fonts.dmMono }]}>
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
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  eventGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  eventPill: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  eventText: { fontSize: 11, letterSpacing: 0.3 },
  btn: { alignItems: 'center', paddingVertical: 12, borderRadius: 10 },
  btnText: { color: '#fff', fontSize: 13, letterSpacing: 1.5 },
  empty: { fontSize: 14, textAlign: 'center' },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: SPACING.md, gap: 6 },
  webhookUrl: { fontSize: 13 },
  events: { fontSize: 12, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: 4 },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  actionText: { fontSize: 12, letterSpacing: 1 },
});
