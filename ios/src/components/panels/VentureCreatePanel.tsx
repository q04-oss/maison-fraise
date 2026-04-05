import React, { useState } from 'react';
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
import { createVenture } from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';

export default function VentureCreatePanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ceoType, setCeoType] = useState<'human' | 'dorotka'>('human');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = name.trim().length > 0 && !submitting;

  const handleCreate = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const venture = await createVenture({
        name: name.trim(),
        description: description.trim() || undefined,
        ceo_type: ceoType,
      });
      showPanel('venture-detail', { ventureId: venture.id });
    } catch (e: any) {
      Alert.alert('Error', 'Could not create venture. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

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
  submitBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitText: { fontSize: 13, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
});
