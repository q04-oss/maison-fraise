import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { createVenture, fetchContacts } from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';

type Split = { user_id: number; display_name: string; share_bps: number };

export default function VentureCreatePanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ceoType, setCeoType] = useState<'human' | 'dorotka'>('human');
  const [splits, setSplits] = useState<Split[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchContacts().then(setContacts).catch(() => {});
  }, []);

  // Fraise takes 5% (500 bps); remaining 9500 bps available to splits
  const FRAISE_CUT_BPS = 500;
  const MAX_SPLIT_BPS = 10000 - FRAISE_CUT_BPS;
  const usedBps = splits.reduce((s, r) => s + r.share_bps, 0);
  const remainingBps = MAX_SPLIT_BPS - usedBps;

  const handleAddContact = (contact: any) => {
    if (splits.some(s => s.user_id === contact.id)) return;
    if (remainingBps <= 0) { Alert.alert('No allocation remaining', 'Remove a split to add another.'); return; }
    const defaultShare = Math.min(1000, remainingBps); // default 10%
    setSplits(prev => [...prev, {
      user_id: contact.id,
      display_name: contact.display_name ?? contact.email?.split('@')[0] ?? 'unknown',
      share_bps: defaultShare,
    }]);
  };

  const handleUpdateShare = (userId: number, text: string) => {
    const pct = parseFloat(text);
    if (isNaN(pct)) return;
    const bps = Math.round(pct * 100);
    setSplits(prev => prev.map(s => s.user_id === userId ? { ...s, share_bps: Math.max(0, Math.min(bps, s.share_bps + remainingBps)) } : s));
  };

  const handleRemoveSplit = (userId: number) => {
    setSplits(prev => prev.filter(s => s.user_id !== userId));
  };

  const canSubmit = name.trim().length > 0 && !submitting;

  const handleCreate = async () => {
    if (!canSubmit) return;
    if (usedBps > MAX_SPLIT_BPS) {
      Alert.alert('Splits too high', `Total splits cannot exceed ${(MAX_SPLIT_BPS / 100).toFixed(0)}% (fraise takes 5%).`);
      return;
    }
    setSubmitting(true);
    try {
      const venture = await createVenture({
        name: name.trim(),
        description: description.trim() || undefined,
        ceo_type: ceoType,
        revenue_splits: splits.length > 0 ? splits.map(s => ({ user_id: s.user_id, share_bps: s.share_bps })) : undefined,
      });
      showPanel('venture-detail', { ventureId: venture.id });
    } catch {
      Alert.alert('Error', 'Could not create venture. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const availableContacts = contacts.filter(c => !splits.some(s => s.user_id === c.id));

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: c.text }]}>new venture</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.form}
      >
        <View style={styles.field}>
          <Text style={[styles.label, { color: c.muted }]}>NAME</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderBottomColor: c.border }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Studio Fraise"
            placeholderTextColor={c.muted}
            autoCorrect={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: c.muted }]}>DESCRIPTION (OPTIONAL)</Text>
          <TextInput
            style={[styles.input, styles.textarea, { color: c.text, borderBottomColor: c.border }]}
            value={description}
            onChangeText={setDescription}
            placeholder="What does this venture do?"
            placeholderTextColor={c.muted}
            multiline
            autoCorrect={false}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: c.muted }]}>LEADERSHIP</Text>
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[
                styles.toggleOption,
                { borderColor: c.border },
                ceoType === 'human' && { backgroundColor: c.text, borderColor: c.text },
              ]}
              onPress={() => setCeoType('human')}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleText, { color: ceoType === 'human' ? c.background : c.muted }]}>
                human-led
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleOption,
                { borderColor: c.border },
                ceoType === 'dorotka' && { backgroundColor: c.accent, borderColor: c.accent },
              ]}
              onPress={() => setCeoType('dorotka')}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleText, { color: ceoType === 'dorotka' ? c.background : c.muted }]}>
                dorotka
              </Text>
            </TouchableOpacity>
          </View>
          {ceoType === 'dorotka' && (
            <Text style={[styles.hint, { color: c.muted }]}>
              Dorotka is an AI CEO. Your venture operates as a worker co-op — no salary overhead, members share the revenue.
            </Text>
          )}
        </View>

        {/* Revenue splits */}
        <View style={styles.field}>
          <View style={styles.splitHeader}>
            <Text style={[styles.label, { color: c.muted }]}>REVENUE SPLITS (OPTIONAL)</Text>
            <Text style={[styles.remaining, { color: remainingBps < 0 ? 'red' : c.muted }]}>
              {(remainingBps / 100).toFixed(0)}% remaining
            </Text>
          </View>
          <Text style={[styles.hint, { color: c.muted }]}>
            Fraise takes 5%. Allocate the rest to contacts. Unallocated revenue stays in the venture pool.
          </Text>

          {splits.map(split => (
            <View key={split.user_id} style={[styles.splitRow, { borderColor: c.border }]}>
              <Text style={[styles.splitName, { color: c.text }]} numberOfLines={1}>{split.display_name}</Text>
              <View style={styles.splitRight}>
                <TextInput
                  style={[styles.splitInput, { color: c.text, borderColor: c.border }]}
                  value={String((split.share_bps / 100).toFixed(0))}
                  onChangeText={t => handleUpdateShare(split.user_id, t)}
                  keyboardType="numeric"
                  maxLength={3}
                />
                <Text style={[styles.splitPct, { color: c.muted }]}>%</Text>
                <TouchableOpacity onPress={() => handleRemoveSplit(split.user_id)} activeOpacity={0.7} style={styles.splitRemove}>
                  <Text style={[styles.splitRemoveText, { color: c.muted }]}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {availableContacts.length > 0 && (
            <View style={styles.contactsList}>
              <Text style={[styles.hint, { color: c.muted }]}>add from contacts:</Text>
              {availableContacts.map(contact => (
                <TouchableOpacity
                  key={contact.id}
                  onPress={() => handleAddContact(contact)}
                  activeOpacity={0.7}
                  style={[styles.contactChip, { borderColor: c.border }]}
                >
                  <Text style={[styles.contactChipText, { color: c.text }]}>
                    {contact.display_name ?? contact.email?.split('@')[0] ?? 'unknown'} +
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: c.text }, !canSubmit && { opacity: 0.4 }]}
          onPress={handleCreate}
          disabled={!canSubmit}
          activeOpacity={0.8}
        >
          <Text style={[styles.submitText, { color: c.background }]}>
            {submitting ? 'creating…' : 'create venture'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
  backBtn: { paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 28 },
  title: { fontSize: 17, fontFamily: fonts.playfair },
  form: { paddingHorizontal: SPACING.md, paddingTop: 24, paddingBottom: 60, gap: 28 },
  field: { gap: 8 },
  label: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, textTransform: 'uppercase' },
  input: {
    fontSize: 16,
    fontFamily: fonts.dmSans,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  toggle: { flexDirection: 'row', gap: 10 },
  toggleOption: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  hint: { fontSize: 11, fontFamily: fonts.dmSans, lineHeight: 16, fontStyle: 'italic' },
  splitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  remaining: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  splitName: { fontSize: 14, fontFamily: fonts.dmSans, flex: 1 },
  splitRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  splitInput: {
    width: 40,
    height: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    textAlign: 'center',
    fontSize: 14,
    fontFamily: fonts.dmMono,
  },
  splitPct: { fontSize: 12, fontFamily: fonts.dmMono },
  splitRemove: { paddingHorizontal: 6 },
  splitRemoveText: { fontSize: 18, lineHeight: 20 },
  contactsList: { gap: 6, marginTop: 4 },
  contactChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  contactChipText: { fontSize: 13, fontFamily: fonts.dmSans },
  submitBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitText: { fontSize: 13, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
});
