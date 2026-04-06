import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../../theme';
import {
  fetchMarketListings, createVendorListing, updateVendorListing, deleteVendorListing,
} from '../../../lib/api';

const CATEGORIES = ['fruit', 'vegetable', 'herb', 'grain', 'dairy', 'other'];
const UNIT_TYPES = ['per_item', 'per_bunch', 'per_100g', 'per_kg'];
const TAG_HINT = 'Suggested: high-fiber · high-vitamin-c · high-protein · low-sugar · organic · seasonal';

export default function VendorPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  // All hooks before conditional return
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingListing, setEditingListing] = useState<any | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('fruit');
  const [unitType, setUnitType] = useState('per_item');
  const [unitLabel, setUnitLabel] = useState('each');
  const [priceStr, setPriceStr] = useState('');
  const [stockStr, setStockStr] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');

  const loadListings = async () => {
    setLoading(true);
    try { setListings(await fetchMarketListings()); } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadListings(); }, []);

  const openAdd = () => {
    setEditingListing(null);
    setName(''); setDescription(''); setCategory('fruit');
    setUnitType('per_item'); setUnitLabel('each');
    setPriceStr(''); setStockStr(''); setTagsStr('');
    setAvailableFrom(''); setAvailableUntil('');
    setAdding(true);
  };

  const openEdit = (item: any) => {
    setEditingListing(item);
    setName(item.name ?? '');
    setDescription(item.description ?? '');
    setCategory(item.category ?? 'fruit');
    setUnitType(item.unit_type ?? 'per_item');
    setUnitLabel(item.unit_label ?? 'each');
    setPriceStr(item.price_cents ? (item.price_cents / 100).toFixed(2) : '');
    setStockStr(item.stock_quantity != null ? String(item.stock_quantity) : '');
    setTagsStr(Array.isArray(item.tags) ? item.tags.join(', ') : '');
    setAvailableFrom(item.available_from ? item.available_from.slice(0, 10) : '');
    setAvailableUntil(item.available_until ? item.available_until.slice(0, 10) : '');
    setAdding(true);
  };

  const cancelForm = () => {
    setAdding(false);
    setEditingListing(null);
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    if (!priceStr.trim()) { Alert.alert('Price required'); return; }
    if (!availableFrom.trim() || !availableUntil.trim()) { Alert.alert('Availability dates required'); return; }
    setSaving(true);
    try {
      const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
      const price_cents = Math.round(parseFloat(priceStr) * 100);
      const stock_quantity = stockStr.trim() ? parseInt(stockStr, 10) : 0;

      if (editingListing) {
        const updated = await updateVendorListing(editingListing.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          price_cents,
          stock_quantity,
          tags,
        });
        setListings(prev => prev.map(i => i.id === editingListing.id ? updated : i));
      } else {
        const created = await createVendorListing({
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          unit_type: unitType,
          unit_label: unitLabel.trim() || 'each',
          price_cents,
          stock_quantity,
          tags,
          available_from: availableFrom,
          available_until: availableUntil,
        });
        setListings(prev => [...prev, created]);
      }
      setAdding(false);
      setEditingListing(null);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save listing.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (item: any) => {
    Alert.alert(`Remove "${item.name}"?`, 'This will hide the listing.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await deleteVendorListing(item.id).catch(() => {});
          setListings(prev => prev.filter(i => i.id !== item.id));
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={adding ? cancelForm : goBack}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text, fontFamily: fonts.dmMono }]}>MY LISTINGS</Text>
        {!adding ? (
          <TouchableOpacity onPress={openAdd} style={styles.addBtn} activeOpacity={0.7}>
            <Text style={[styles.addBtnText, { color: c.accent }]}>+</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.addBtn} />
        )}
      </View>

      {/* Add / Edit form */}
      {adding && (
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[styles.fieldLabel, { color: c.muted }]}>ITEM NAME</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={name} onChangeText={setName}
            placeholder="e.g. Strawberries"
            placeholderTextColor={c.muted}
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.inputMulti, { color: c.text, borderColor: c.border }]}
            value={description} onChangeText={setDescription}
            placeholder="Optional detail…"
            placeholderTextColor={c.muted}
            multiline
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>CATEGORY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.pill,
                  { borderColor: c.border, backgroundColor: category === cat ? c.accent : 'transparent' },
                ]}
                onPress={() => setCategory(cat)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.pillText,
                  { color: category === cat ? (c.ctaText ?? '#fff') : c.muted, fontFamily: fonts.dmMono },
                ]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.fieldLabel, { color: c.muted }]}>UNIT TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
            {UNIT_TYPES.map(ut => (
              <TouchableOpacity
                key={ut}
                style={[
                  styles.pill,
                  { borderColor: c.border, backgroundColor: unitType === ut ? c.accent : 'transparent' },
                ]}
                onPress={() => setUnitType(ut)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.pillText,
                  { color: unitType === ut ? (c.ctaText ?? '#fff') : c.muted, fontFamily: fonts.dmMono },
                ]}>
                  {ut}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.fieldLabel, { color: c.muted }]}>UNIT LABEL</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={unitLabel} onChangeText={setUnitLabel}
            placeholder="each, bunch, 100g, kg…"
            placeholderTextColor={c.muted}
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>PRICE (CA$)</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={priceStr} onChangeText={setPriceStr}
            placeholder="0.00"
            placeholderTextColor={c.muted}
            keyboardType="decimal-pad"
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>STOCK QUANTITY</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={stockStr} onChangeText={setStockStr}
            placeholder="0"
            placeholderTextColor={c.muted}
            keyboardType="number-pad"
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>AVAILABLE FROM (YYYY-MM-DD)</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={availableFrom} onChangeText={setAvailableFrom}
            placeholder="2026-04-07"
            placeholderTextColor={c.muted}
            keyboardType="numbers-and-punctuation"
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>AVAILABLE UNTIL (YYYY-MM-DD)</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={availableUntil} onChangeText={setAvailableUntil}
            placeholder="2026-04-13"
            placeholderTextColor={c.muted}
            keyboardType="numbers-and-punctuation"
          />

          <Text style={[styles.fieldLabel, { color: c.muted }]}>TAGS</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            value={tagsStr} onChangeText={setTagsStr}
            placeholder="high-fiber, high-vitamin-c, organic"
            placeholderTextColor={c.muted}
          />
          <Text style={[styles.tagHint, { color: c.muted, fontFamily: fonts.dmSans }]}>{TAG_HINT}</Text>

          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: c.accent }, saving && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={[styles.saveBtnText, { color: c.ctaText ?? '#fff', fontFamily: fonts.dmMono }]}>
                {saving ? 'SAVING…' : editingListing ? 'SAVE CHANGES' : 'ADD LISTING'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: c.border }]}
              onPress={cancelForm}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelBtnText, { color: c.muted, fontFamily: fonts.dmSans }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      )}

      {/* Listings list */}
      {!adding && (
        <>
          {loading ? (
            <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
          ) : (
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              {listings.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={[styles.emptyTitle, { color: c.text, fontFamily: fonts.playfair }]}>No listings yet</Text>
                  <Text style={[styles.emptyHint, { color: c.muted, fontFamily: fonts.dmSans }]}>
                    Tap + to add your first produce listing.
                  </Text>
                </View>
              ) : (
                listings.map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.itemRow, { borderBottomColor: c.border, backgroundColor: c.card }]}
                    onPress={() => openEdit(item)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.itemInfo}>
                      <View style={styles.itemTopRow}>
                        <Text style={[styles.itemName, { color: c.text, fontFamily: fonts.dmSans }]}>{item.name}</Text>
                        <View style={[styles.catBadge, { borderColor: c.border }]}>
                          <Text style={[styles.catBadgeText, { color: c.muted, fontFamily: fonts.dmMono }]}>
                            {item.category}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.itemMeta, { color: c.muted, fontFamily: fonts.dmMono }]}>
                        CA${(item.price_cents / 100).toFixed(2)} / {item.unit_label}
                        {item.stock_quantity != null ? `  ·  ${item.stock_quantity} left` : ''}
                      </Text>
                      {Array.isArray(item.tags) && item.tags.length > 0 && (
                        <Text style={[styles.itemTags, { color: c.accent, fontFamily: fonts.dmSans }]}>
                          {(item.tags as string[]).join(' · ')}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemove(item)}
                      style={styles.removeBtn}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.removeBtnText, { color: c.muted, fontFamily: fonts.dmSans }]}>remove</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              )}
              <View style={{ height: SPACING.xl }} />
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  backBtnText: { fontSize: 22 },
  headerTitle: { fontSize: 14, letterSpacing: 2 },
  addBtn: { width: 40, alignItems: 'flex-end' },
  addBtnText: { fontSize: 26, lineHeight: 30 },
  scroll: { flex: 1, paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  fieldLabel: { fontSize: 11, letterSpacing: 1.5, marginBottom: 6, marginTop: SPACING.md },
  input: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, marginBottom: 2,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  pillRow: { flexDirection: 'row', marginVertical: SPACING.sm },
  pill: {
    borderRadius: 20, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, paddingVertical: 7, marginRight: 8,
  },
  pillText: { fontSize: 12, letterSpacing: 0.8 },
  tagHint: { fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: SPACING.sm, opacity: 0.8 },
  formActions: { gap: 10, marginTop: SPACING.md },
  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 13, letterSpacing: 1.5 },
  cancelBtn: {
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  cancelBtnText: { fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 60, gap: SPACING.sm },
  emptyTitle: { fontSize: 22 },
  emptyHint: { fontSize: 14, textAlign: 'center', lineHeight: 22, paddingHorizontal: SPACING.md },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 12, marginBottom: 6,
  },
  itemInfo: { flex: 1 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  itemName: { fontSize: 15 },
  catBadge: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  catBadgeText: { fontSize: 10, letterSpacing: 1 },
  itemMeta: { fontSize: 12, marginTop: 3 },
  itemTags: { fontSize: 12, marginTop: 3, opacity: 0.9 },
  removeBtn: { paddingLeft: SPACING.sm, paddingVertical: 4 },
  removeBtnText: { fontSize: 13 },
});
