import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, TextInput, Alert, Switch,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import {
  fetchMyMenuItems, createMenuItem, updateMenuItem, deleteMenuItem,
} from '../../lib/api';

const CATEGORIES = ['amuse', 'starter', 'main', 'dessert', 'drink', 'side'];

type Screen = 'list' | 'add';

export default function BusinessMenuPanel() {
  const { goBack } = usePanel();
  const c = useColors();

  const [screen, setScreen] = useState<Screen>('list');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceCents, setPriceCents] = useState('');
  const [category, setCategory] = useState('main');
  const [tagsRaw, setTagsRaw] = useState(''); // comma-separated

  const loadItems = async () => {
    setLoading(true);
    try { setItems(await fetchMyMenuItems()); } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadItems(); }, []);

  const handleAdd = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      const price = priceCents.trim() ? Math.round(parseFloat(priceCents) * 100) : undefined;
      const created = await createMenuItem({
        name: name.trim(),
        description: description.trim() || undefined,
        price_cents: price,
        category,
        tags,
      });
      setItems(prev => [...prev, created]);
      setName(''); setDescription(''); setPriceCents(''); setTagsRaw(''); setCategory('main');
      setScreen('list');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not add item.');
    } finally { setSaving(false); }
  };

  const handleToggle = async (item: any) => {
    try {
      const updated = await updateMenuItem(item.id, { is_available: !item.is_available });
      setItems(prev => prev.map(i => i.id === item.id ? updated : i));
    } catch { /* ignore */ }
  };

  const handleDelete = (item: any) => {
    Alert.alert(`Remove "${item.name}"?`, '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await deleteMenuItem(item.id).catch(() => {});
          setItems(prev => prev.filter(i => i.id !== item.id));
        },
      },
    ]);
  };

  const byCategory = CATEGORIES.reduce<Record<string, any[]>>((acc, cat) => {
    acc[cat] = items.filter(i => i.category === cat);
    return acc;
  }, {});

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={screen === 'add' ? () => setScreen('list') : goBack}
          style={styles.backBtn} activeOpacity={0.7}
        >
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Restaurant Menu</Text>
        {screen === 'list' && (
          <TouchableOpacity onPress={() => setScreen('add')} style={styles.addBtn} activeOpacity={0.7}>
            <Text style={[styles.addBtnText, { color: c.accent }]}>+ item</Text>
          </TouchableOpacity>
        )}
        {screen === 'add' && <View style={styles.addBtn} />}
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : screen === 'add' ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.fieldLabel, { color: c.muted }]}>ITEM NAME</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={name} onChangeText={setName} placeholder="Seared scallop, pea purée…" placeholderTextColor={c.muted} />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>DESCRIPTION</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={description} onChangeText={setDescription} placeholder="Optional detail…" placeholderTextColor={c.muted} multiline />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>PRICE (CA$)</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={priceCents} onChangeText={setPriceCents} placeholder="18.00" placeholderTextColor={c.muted} keyboardType="decimal-pad" />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>CATEGORY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.catPill, { borderColor: c.border, backgroundColor: category === cat ? c.accent : 'transparent' }]}
                onPress={() => setCategory(cat)} activeOpacity={0.7}
              >
                <Text style={[styles.catPillText, { color: category === cat ? (c.ctaText ?? '#fff') : c.muted }]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.fieldLabel, { color: c.muted }]}>TAGS (comma-separated)</Text>
          <TextInput style={[styles.input, { color: c.text, borderColor: c.border }]} value={tagsRaw} onChangeText={setTagsRaw} placeholder="anti-inflammatory, umami, vegan…" placeholderTextColor={c.muted} />

          <Text style={[styles.hintText, { color: c.muted }]}>
            Tags let Dorotka recommend this item to users whose biometrics match.
            Common tags: anti-inflammatory, adaptogenic, probiotic, prebiotic, hydrating, umami, rich, light, vegan, meat, dairy, fish, gf-available.
          </Text>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: c.accent }, saving && { opacity: 0.5 }]}
            onPress={handleAdd} disabled={saving} activeOpacity={0.8}
          >
            <Text style={[styles.saveBtnText, { color: c.ctaText ?? '#fff' }]}>
              {saving ? 'Adding…' : 'Add to Menu'}
            </Text>
          </TouchableOpacity>
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: c.text }]}>No menu items yet</Text>
              <Text style={[styles.emptyHint, { color: c.muted }]}>
                Add your dishes so Dorotka can recommend the right ones to each guest based on their biometrics.
              </Text>
            </View>
          ) : (
            CATEGORIES.map(cat => {
              const catItems = byCategory[cat];
              if (!catItems.length) return null;
              return (
                <View key={cat}>
                  <Text style={[styles.catLabel, { color: c.muted }]}>{cat.toUpperCase()}</Text>
                  {catItems.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.itemRow, { borderBottomColor: c.border }]}
                      onLongPress={() => handleDelete(item)}
                      delayLongPress={600}
                      activeOpacity={0.8}
                    >
                      <View style={styles.itemInfo}>
                        <Text style={[styles.itemName, { color: item.is_available ? c.text : c.muted }]}>{item.name}</Text>
                        {item.description ? (
                          <Text style={[styles.itemDesc, { color: c.muted }]} numberOfLines={1}>{item.description}</Text>
                        ) : null}
                        {item.price_cents ? (
                          <Text style={[styles.itemPrice, { color: c.muted }]}>
                            CA${(item.price_cents / 100).toFixed(2)}
                          </Text>
                        ) : null}
                        {(item.tags as string[])?.length > 0 && (
                          <Text style={[styles.itemTags, { color: c.accent }]}>
                            {(item.tags as string[]).join(' · ')}
                          </Text>
                        )}
                      </View>
                      <Switch
                        value={item.is_available}
                        onValueChange={() => handleToggle(item)}
                        trackColor={{ true: c.accent }}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })
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
  title: { flex: 1, fontSize: 18, fontFamily: fonts.playfair, textAlign: 'center' },
  addBtn: { width: 50, alignItems: 'flex-end' },
  addBtnText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  scroll: { flex: 1, paddingHorizontal: SPACING.md },
  catLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 2, marginTop: SPACING.md, marginBottom: SPACING.sm },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { fontSize: 15, fontFamily: fonts.playfair },
  itemDesc: { fontSize: 11, fontFamily: fonts.dmSans },
  itemPrice: { fontSize: 11, fontFamily: fonts.dmMono },
  itemTags: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1 },
  empty: { paddingTop: 60, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: fonts.playfair },
  emptyHint: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20, textAlign: 'center' },
  fieldLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginTop: SPACING.md, marginBottom: 6 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 12, fontSize: 15, fontFamily: fonts.dmSans },
  catRow: { flexDirection: 'row', marginBottom: 4 },
  catPill: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, marginRight: 8,
  },
  catPillText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  hintText: { fontSize: 11, fontFamily: fonts.dmSans, lineHeight: 17, marginTop: SPACING.sm },
  saveBtn: { marginTop: SPACING.lg, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontFamily: fonts.dmMono, letterSpacing: 1 },
});
