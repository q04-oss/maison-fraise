import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { submitProposal } from '../../lib/api';

export default function ProposeBusinessPanel() {
  const { goBack } = usePanel();
  const c = useColors();

  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [instagram, setInstagram] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const addressRef = useRef<TextInput>(null);
  const instagramRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const noteRef = useRef<TextInput>(null);

  const handleSubmit = async () => {
    if (!businessName.trim()) {
      Alert.alert('Name required', 'Enter the business name.');
      return;
    }
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await submitProposal({
        business_name: businessName.trim(),
        business_address: address.trim() || undefined,
        instagram_handle: instagram.trim().replace(/^@/, '') || undefined,
        business_email: email.trim() || undefined,
        note: note.trim() || undefined,
      });
      setDone(true);
    } catch {
      Alert.alert('Something went wrong', 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <View style={[styles.container, styles.doneWrap]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.6}>
          <Text style={[styles.backText, { color: c.muted }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.doneBody}>
          <Text style={[styles.doneTitle, { color: c.text }]}>Proposed.</Text>
          <Text style={[styles.doneSub, { color: c.muted }]}>
            {email.trim()
              ? `We've sent ${businessName.trim()} an introduction. If they're interested, we'll be in touch.`
              : `Thanks for the nomination. We'll look into it.`}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.6}>
            <Text style={[styles.backText, { color: c.muted }]}>←</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.title, { color: c.text }]}>Nominate a business</Text>
        <Text style={[styles.subtitle, { color: c.muted }]}>
          Know a place that belongs on Box Fraise? Put it on the map.
        </Text>

        <View style={[styles.divider, { backgroundColor: c.border }]} />

        <Text style={[styles.fieldLabel, { color: c.muted }]}>business name</Text>
        <TextInput
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.sheetBg }]}
          placeholder="Name"
          placeholderTextColor={c.muted}
          value={businessName}
          onChangeText={setBusinessName}
          returnKeyType="next"
          onSubmitEditing={() => addressRef.current?.focus()}
          autoCapitalize="words"
        />

        <Text style={[styles.fieldLabel, { color: c.muted }]}>address</Text>
        <TextInput
          ref={addressRef}
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.sheetBg }]}
          placeholder="Street address (optional)"
          placeholderTextColor={c.muted}
          value={address}
          onChangeText={setAddress}
          returnKeyType="next"
          onSubmitEditing={() => instagramRef.current?.focus()}
          autoCapitalize="words"
        />

        <Text style={[styles.fieldLabel, { color: c.muted }]}>instagram</Text>
        <TextInput
          ref={instagramRef}
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.sheetBg }]}
          placeholder="@handle (optional)"
          placeholderTextColor={c.muted}
          value={instagram}
          onChangeText={setInstagram}
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.fieldLabel, { color: c.muted }]}>their email</Text>
        <TextInput
          ref={emailRef}
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.sheetBg }]}
          placeholder="Contact email — we'll reach out (optional)"
          placeholderTextColor={c.muted}
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
          onSubmitEditing={() => noteRef.current?.focus()}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.fieldLabel, { color: c.muted }]}>note</Text>
        <TextInput
          ref={noteRef}
          style={[styles.input, styles.noteInput, { color: c.text, borderColor: c.border, backgroundColor: c.sheetBg }]}
          placeholder="Why do they belong here? (optional)"
          placeholderTextColor={c.muted}
          value={note}
          onChangeText={setNote}
          multiline
          returnKeyType="done"
          autoCapitalize="sentences"
        />

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: c.text, opacity: submitting ? 0.5 : 1 }]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting
            ? <ActivityIndicator color={c.sheetBg} />
            : <Text style={[styles.submitText, { color: c.sheetBg }]}>Nominate</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingBottom: 48 },
  header: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { fontSize: 20 },
  title: { fontSize: 26, fontFamily: fonts.playfair, paddingHorizontal: SPACING.md, paddingTop: SPACING.lg },
  subtitle: { fontSize: 14, fontFamily: fonts.dmSans, paddingHorizontal: SPACING.md, paddingTop: 8, paddingBottom: SPACING.md, lineHeight: 20 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md, marginBottom: SPACING.lg },
  fieldLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, textTransform: 'uppercase', paddingHorizontal: SPACING.md, paddingBottom: 6 },
  input: { marginHorizontal: SPACING.md, marginBottom: SPACING.md, borderWidth: StyleSheet.hairlineWidth, padding: 12, fontSize: 15, fontFamily: fonts.dmSans },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  submitBtn: { marginHorizontal: SPACING.md, marginTop: SPACING.md, paddingVertical: 14, alignItems: 'center' },
  submitText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1.5, textTransform: 'uppercase' },
  doneWrap: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  doneBody: { flex: 1, justifyContent: 'center', paddingBottom: 80 },
  doneTitle: { fontSize: 32, fontFamily: fonts.playfair, marginBottom: 16 },
  doneSub: { fontSize: 15, fontFamily: fonts.dmSans, lineHeight: 22 },
});
