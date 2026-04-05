import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { createCollectif } from '../../lib/api';
import { useColors, fonts, SPACING } from '../../theme';

type CollectifType = 'product' | 'popup' | 'vendor_invite' | 'product_prebuy';

export default function CollectifCreatePanel() {
  const { goBack, showPanel, panelData } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [collectifType, setCollectifType] = useState<CollectifType>(
    (panelData?.collectifType as CollectifType) ??
    (panelData?.isPopup ? 'popup' : 'product')
  );

  // Shared fields
  const [businessName, setBusinessName] = useState(panelData?.businessName ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetStr, setTargetStr] = useState('');
  const [deadlineStr, setDeadlineStr] = useState('');

  // Product-only fields
  const [discountStr, setDiscountStr] = useState('');
  const [priceStr, setPriceStr] = useState('');

  // Popup-only fields
  const [proposedVenue, setProposedVenue] = useState(panelData?.proposedVenue ?? '');
  const [proposedDate, setProposedDate] = useState(panelData?.proposedDate ?? '');
  const [depositStr, setDepositStr] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const isPopup = collectifType === 'popup';
  const isVendorInvite = collectifType === 'vendor_invite';
  const isPrebuy = collectifType === 'product_prebuy';
  const isMarketType = isVendorInvite || isPrebuy;

  const canSubmit = (() => {
    if (!businessName.trim() || !targetStr || !deadlineStr || submitting) return false;
    if (isPopup) return !!(title.trim() && proposedVenue.trim() && proposedDate.trim() && depositStr);
    if (isVendorInvite) return !!(title.trim() && proposedVenue.trim() && proposedDate.trim() && depositStr);
    if (isPrebuy) return !!(title.trim() && priceStr && proposedDate.trim());
    return !!(title.trim() && discountStr && priceStr);
  })();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const target = parseInt(targetStr, 10);
    const deadline = new Date(deadlineStr);

    if (isNaN(target) || target < 2) {
      Alert.alert('Invalid target', 'Target must be at least 2.'); return;
    }
    if (isNaN(deadline.getTime()) || deadline <= new Date()) {
      Alert.alert('Invalid deadline', 'Deadline must be a future date (YYYY-MM-DD).'); return;
    }

    if (isVendorInvite) {
      const deposit = Math.round(parseFloat(depositStr) * 100);
      if (isNaN(deposit) || deposit < 100) {
        Alert.alert('Invalid deposit', 'Deposit must be at least CA$1.00.'); return;
      }
      setSubmitting(true);
      try {
        await createCollectif({
          business_name: businessName.trim(),
          collectif_type: 'vendor_invite',
          title: title.trim(),
          description: description.trim() || undefined,
          price_cents: deposit,
          proposed_venue: proposedVenue.trim(),
          proposed_date: proposedDate.trim(),
          target_quantity: target,
          deadline: deadline.toISOString(),
        });
        Alert.alert(
          'Vendor invite proposed.',
          'If enough members commit, the vendor gets a formal invitation.',
          [{ text: 'OK', onPress: () => { goBack(); showPanel('collectif-list'); } }],
        );
      } catch (e: any) {
        Alert.alert('Could not post', e.message ?? 'Please try again.');
      } finally {
        setSubmitting(false);
      }
    } else if (isPrebuy) {
      const price = Math.round(parseFloat(priceStr) * 100);
      if (isNaN(price) || price < 100) {
        Alert.alert('Invalid price', 'Price must be at least CA$1.00.'); return;
      }
      setSubmitting(true);
      try {
        await createCollectif({
          business_name: businessName.trim(),
          collectif_type: 'product_prebuy',
          title: title.trim(),
          description: description.trim() || undefined,
          price_cents: price,
          proposed_date: proposedDate.trim(),
          target_quantity: target,
          deadline: deadline.toISOString(),
        });
        Alert.alert(
          'Pre-buy proposed.',
          'If enough members commit, the vendor is expected to bring it.',
          [{ text: 'OK', onPress: () => { goBack(); showPanel('collectif-list'); } }],
        );
      } catch (e: any) {
        Alert.alert('Could not post', e.message ?? 'Please try again.');
      } finally {
        setSubmitting(false);
      }
    } else if (isPopup) {
      const deposit = Math.round(parseFloat(depositStr) * 100);
      if (isNaN(deposit) || deposit < 100) {
        Alert.alert('Invalid deposit', 'Deposit must be at least CA$1.00.'); return;
      }
      setSubmitting(true);
      try {
        await createCollectif({
          business_name: businessName.trim(),
          collectif_type: 'popup',
          title: title.trim(),
          description: description.trim() || undefined,
          price_cents: deposit,
          proposed_venue: proposedVenue.trim(),
          proposed_date: proposedDate.trim(),
          target_quantity: target,
          deadline: deadline.toISOString(),
        });
        Alert.alert(
          'Popup proposed.',
          'Your proposal is live. If enough members commit, the business will be contacted.',
          [{ text: 'OK', onPress: () => { goBack(); showPanel('collectif-list'); } }],
        );
      } catch (e: any) {
        Alert.alert('Could not post', e.message ?? 'Please try again.');
      } finally {
        setSubmitting(false);
      }
    } else {
      const discount = parseInt(discountStr, 10);
      const price = Math.round(parseFloat(priceStr) * 100);
      if (isNaN(discount) || discount < 1 || discount > 80) {
        Alert.alert('Invalid discount', 'Discount must be between 1% and 80%.'); return;
      }
      if (isNaN(price) || price < 100) {
        Alert.alert('Invalid price', 'Price must be at least CA$1.00.'); return;
      }
      setSubmitting(true);
      try {
        await createCollectif({
          business_name: businessName.trim(),
          collectif_type: 'product',
          title: title.trim(),
          description: description.trim() || undefined,
          proposed_discount_pct: discount,
          price_cents: price,
          target_quantity: target,
          deadline: deadline.toISOString(),
        });
        Alert.alert(
          'Collectif posted.',
          'Your proposal is live. Share it with others to build momentum.',
          [{ text: 'OK', onPress: () => { goBack(); showPanel('collectif-list'); } }],
        );
      } catch (e: any) {
        Alert.alert('Could not post', e.message ?? 'Please try again.');
      } finally {
        setSubmitting(false);
      }
    }
  };

  const Field = ({
    label, value, onChange, placeholder, keyboardType = 'default', hint, multiline,
  }: {
    label: string; value: string; onChange: (v: string) => void;
    placeholder?: string; keyboardType?: any; hint?: string; multiline?: boolean;
  }) => (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: c.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        style={[
          multiline ? styles.textarea : styles.input,
          { borderBottomColor: c.border, color: c.text },
        ]}
        autoCorrect={false}
      />
      {hint && <Text style={[styles.hint, { color: c.muted }]}>{hint}</Text>}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>
          {isVendorInvite ? 'invite a vendor' : isPrebuy ? 'propose a pre-buy' : isPopup ? 'propose a popup' : 'propose a collectif'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: SPACING.md, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Type toggle */}
        <View style={[styles.toggle, { backgroundColor: c.cardDark }]}>
          {([
            { id: 'product' as CollectifType, label: 'Product' },
            { id: 'popup' as CollectifType, label: 'Popup' },
            { id: 'vendor_invite' as CollectifType, label: 'Vendor' },
            { id: 'product_prebuy' as CollectifType, label: 'Pre-buy' },
          ]).map(({ id, label }) => (
            <TouchableOpacity
              key={id}
              style={[styles.toggleOption, collectifType === id && { backgroundColor: c.accent }]}
              onPress={() => setCollectifType(id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, { color: collectifType === id ? c.panelBg : c.muted }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.subheading, { color: c.muted }]}>
          {isVendorInvite
            ? 'Invite a vendor to the market. If enough members commit a deposit, the vendor gets a formal invitation with a guaranteed audience.'
            : isPrebuy
            ? 'Request a product from a vendor. If enough members pre-buy, the vendor is expected to bring it on market day.'
            : isPopup
            ? 'Propose a popup event. If enough members commit a deposit, the business is formally invited to host.'
            : 'Name the business, describe what you want, set a discount and target. If enough members commit, the business gets a formal request.'
          }
        </Text>

        <Field
          label={isVendorInvite ? 'VENDOR NAME' : isPrebuy ? 'VENDOR NAME' : 'BUSINESS NAME'}
          value={businessName}
          onChange={setBusinessName}
          placeholder={isMarketType ? 'e.g. Le Potager des Sœurs' : 'e.g. Valrhona, Chocolaterie Bernard'}
          hint={isMarketType ? undefined : 'Must be a business on the Maison platform.'}
        />
        <Field
          label="TITLE"
          value={title}
          onChange={setTitle}
          placeholder={
            isVendorInvite ? "e.g. Invite Le Potager to the June market" :
            isPrebuy ? "e.g. Heritage tomato flat (6 lbs)" :
            isPopup ? "e.g. Valentine's popup at Café Central" :
            'e.g. Bulk order — 10 boxes Guanaja 70%'
          }
        />
        <Field
          label="DESCRIPTION (OPTIONAL)"
          value={description}
          onChange={setDescription}
          placeholder={isMarketType ? "Any context for other members…" : isPopup ? "Describe the event concept, vibe, what you'd like…" : "What you're asking for, any specific details…"}
          multiline
        />

        {(isPopup || isVendorInvite) && (
          <>
            <Field
              label={isVendorInvite ? 'MARKET NAME / VENUE' : 'PROPOSED VENUE'}
              value={proposedVenue}
              onChange={setProposedVenue}
              placeholder={isVendorInvite ? 'e.g. Marché Fraise — Plateau' : 'e.g. Café Central, 123 Rue Saint-Denis'}
              hint={isVendorInvite ? 'Links this invite to the right market date.' : 'Where you\'d like the popup to happen.'}
            />
            <Field
              label="MARKET DATE (YYYY-MM-DD)"
              value={proposedDate}
              onChange={setProposedDate}
              placeholder="e.g. 2026-06-14"
              hint={isVendorInvite ? 'The market date you want the vendor at.' : 'Approximate date you have in mind.'}
            />
            <Field
              label={isVendorInvite ? 'DEPOSIT PER PERSON (CA$)' : 'DEPOSIT PER PERSON (CA$)'}
              value={depositStr}
              onChange={setDepositStr}
              placeholder="e.g. 5.00"
              keyboardType="decimal-pad"
              hint={isVendorInvite ? 'Good-faith commitment. Refunded if vendor declines.' : 'Held until the business confirms. Refunded if declined.'}
            />
          </>
        )}

        {isPrebuy && (
          <>
            <Field
              label="MARKET DATE (YYYY-MM-DD)"
              value={proposedDate}
              onChange={setProposedDate}
              placeholder="e.g. 2026-06-14"
              hint="The market date you want this product at."
            />
            <Field
              label="PRICE PER UNIT (CA$)"
              value={priceStr}
              onChange={setPriceStr}
              placeholder="e.g. 12.00"
              keyboardType="decimal-pad"
              hint="What each member pays. Held on commitment."
            />
          </>
        )}

        {!isPopup && !isVendorInvite && !isPrebuy && (
          <>
            <Field
              label="PROPOSED DISCOUNT (%)"
              value={discountStr}
              onChange={setDiscountStr}
              placeholder="e.g. 15"
              keyboardType="numeric"
              hint="1–80%. This is what you're asking the business to offer."
            />
            <Field
              label="PRICE PER UNIT AT DISCOUNT (CA$)"
              value={priceStr}
              onChange={setPriceStr}
              placeholder="e.g. 42.50"
              keyboardType="decimal-pad"
              hint="What each member pays. This is held immediately."
            />
          </>
        )}

        <Field
          label={
            isVendorInvite ? 'TARGET (# OF COMMITMENTS)' :
            isPrebuy ? 'TARGET (# OF PRE-BUYS)' :
            isPopup ? 'TARGET (# OF ATTENDEES)' :
            'TARGET (# OF COMMITMENTS)'
          }
          value={targetStr}
          onChange={setTargetStr}
          placeholder="e.g. 20"
          keyboardType="numeric"
          hint={
            isVendorInvite ? 'Minimum 2. The vendor sees this many guaranteed attendees.' :
            isPrebuy ? 'Minimum 2. Vendor brings the product when this is reached.' :
            isPopup ? 'Minimum 2. The business sees the full group once this is reached.' :
            'Minimum 2. The business sees the full pooled amount once this is reached.'
          }
        />
        <Field
          label="DEADLINE (YYYY-MM-DD)"
          value={deadlineStr}
          onChange={setDeadlineStr}
          placeholder="e.g. 2026-06-01"
          hint="If the target isn't met by this date, everyone is refunded."
        />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: c.text }, !canSubmit && { opacity: 0.4 }]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.8}
        >
          <Text style={[styles.submitBtnText, { color: c.ctaText }]}>
            {submitting ? 'Posting…' : isVendorInvite ? 'Invite Vendor' : isPrebuy ? 'Propose Pre-buy' : isPopup ? 'Propose Popup' : 'Post Collectif'}
          </Text>
        </TouchableOpacity>
      </View>
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
  backArrow: { fontSize: 28, lineHeight: 34 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: fonts.playfair },

  toggle: {
    flexDirection: 'row', borderRadius: 12, padding: 4, gap: 4, marginBottom: 20,
  },
  toggleOption: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  toggleText: { fontFamily: fonts.dmSans, fontSize: 14, fontWeight: '600' },

  subheading: {
    fontFamily: fonts.dmSans, fontSize: 13, lineHeight: 20, fontStyle: 'italic', marginBottom: 24,
  },

  field: { marginBottom: 20 },
  fieldLabel: { fontFamily: fonts.dmMono, fontSize: 9, letterSpacing: 1.5, marginBottom: 8 },
  input: {
    fontFamily: fonts.dmMono, fontSize: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  textarea: {
    fontFamily: fonts.dmMono, fontSize: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8, minHeight: 70, textAlignVertical: 'top',
  },
  hint: { fontFamily: fonts.dmSans, fontSize: 11, fontStyle: 'italic', marginTop: 6 },

  footer: {
    padding: SPACING.md, paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  submitBtn: { width: '100%', paddingVertical: 20, borderRadius: 16, alignItems: 'center' },
  submitBtnText: { fontFamily: fonts.dmSans, fontSize: 16, fontWeight: '700' },
});
