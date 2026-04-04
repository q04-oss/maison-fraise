import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, TextInput } from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { applyForJob, fetchBusinessLedger, addJobStatement, JobPosting, LedgerEntry } from '../../lib/api';
import { useColors, fonts, SPACING } from '../../theme';

const STATUS_LABEL: Record<string, string> = {
  applied: 'applied',
  scheduled: 'interview scheduled',
  hired: 'hired',
  not_hired: 'not hired',
  dismissed: 'dismissed',
};

const STATUS_COLOR: Record<string, string> = {
  hired: '#4caf50',
  not_hired: '#888',
  dismissed: '#e57373',
  scheduled: '#c9973a',
  applied: '#888',
};

export default function JobDetailPanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();

  const job: JobPosting | null = panelData?.job ?? null;
  const businessName: string = panelData?.businessName ?? '';

  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  // Statement UI
  const [statementTarget, setStatementTarget] = useState<number | null>(null);
  const [statementText, setStatementText] = useState('');
  const [submittingStatement, setSubmittingStatement] = useState(false);

  useEffect(() => {
    if (!job) return;
    fetchBusinessLedger(job.business_id)
      .then(setLedger)
      .catch(() => {})
      .finally(() => setLoadingLedger(false));
  }, [job?.business_id]);

  if (!job) return null;

  const formatPay = () => {
    const amount = (job.pay_cents / 100).toFixed(0);
    return job.pay_type === 'hourly'
      ? `$${amount} / hour`
      : `$${parseInt(amount).toLocaleString()} / year`;
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      await applyForJob(job.id);
      setApplied(true);
    } catch (e: any) {
      if (e.message === 'Already applied') {
        setApplied(true);
      } else {
        Alert.alert('could not apply', e.message ?? 'try again');
      }
    } finally {
      setApplying(false);
    }
  };

  const handleSubmitStatement = async () => {
    if (!statementTarget || !statementText.trim()) return;
    setSubmittingStatement(true);
    try {
      await addJobStatement(statementTarget, statementText.trim());
      setLedger(prev => prev.map(e =>
        e.application_id === statementTarget
          ? { ...e, candidate_statement: statementText.trim() }
          : e
      ));
      setStatementTarget(null);
      setStatementText('');
    } catch (e: any) {
      Alert.alert('error', e.message ?? 'could not submit statement');
    } finally {
      setSubmittingStatement(false);
    }
  };

  const finalLedger = ledger.filter(e => ['hired', 'not_hired', 'dismissed'].includes(e.status));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 48 }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text }]}>{businessName}</Text>
      </View>

      <View style={{ padding: SPACING.md }}>
        {/* Job listing */}
        <Text style={[styles.sectionLabel, { color: c.muted }]}>position</Text>
        <Text style={[styles.jobTitle, { color: c.text }]}>{job.title}</Text>
        <Text style={[styles.pay, { color: c.accent }]}>{formatPay()}</Text>

        {job.description ? (
          <Text style={[styles.description, { color: c.muted }]}>{job.description}</Text>
        ) : null}

        {/* Apply button */}
        <TouchableOpacity
          onPress={handleApply}
          disabled={applying || applied}
          style={[
            styles.applyBtn,
            { borderColor: applied ? c.border : c.accent, opacity: applying ? 0.5 : 1 },
          ]}
        >
          <Text style={[styles.applyBtnText, { color: applied ? c.muted : c.accent }]}>
            {applied ? 'applied ✓' : applying ? '...' : 'apply →'}
          </Text>
        </TouchableOpacity>

        {/* Hiring ledger */}
        <Text style={[styles.sectionLabel, { color: c.muted, marginTop: 32 }]}>hiring record</Text>

        {loadingLedger && <ActivityIndicator size="small" color={c.muted} style={{ marginTop: 12 }} />}

        {!loadingLedger && finalLedger.length === 0 && (
          <Text style={[styles.emptyLedger, { color: c.muted }]}>no hiring history yet</Text>
        )}

        {finalLedger.map(entry => (
          <View key={entry.application_id} style={[styles.ledgerEntry, { borderBottomColor: c.border }]}>
            <View style={styles.ledgerRow}>
              <Text style={[styles.ledgerName, { color: c.text }]}>
                {entry.applicant_name ?? entry.applicant_code ?? 'anonymous'}
              </Text>
              <Text style={[styles.ledgerStatus, { color: STATUS_COLOR[entry.status] ?? c.muted }]}>
                {STATUS_LABEL[entry.status] ?? entry.status}
              </Text>
            </View>
            <Text style={[styles.ledgerRole, { color: c.muted }]}>
              {entry.job_title}  ·  {entry.pay_type === 'hourly'
                ? `$${(entry.pay_cents / 100).toFixed(0)}/hr`
                : `$${(entry.pay_cents / 100).toLocaleString()}/yr`}
            </Text>

            {entry.employer_statement ? (
              <View style={[styles.statementBox, { backgroundColor: c.panel }]}>
                <Text style={[styles.statementLabel, { color: c.muted }]}>employer</Text>
                <Text style={[styles.statementText, { color: c.text }]}>{entry.employer_statement}</Text>
              </View>
            ) : null}

            {entry.candidate_statement ? (
              <View style={[styles.statementBox, { backgroundColor: c.panel }]}>
                <Text style={[styles.statementLabel, { color: c.muted }]}>candidate</Text>
                <Text style={[styles.statementText, { color: c.text }]}>{entry.candidate_statement}</Text>
              </View>
            ) : null}

            {/* If candidate hasn't added statement yet, show option */}
            {!entry.candidate_statement && statementTarget !== entry.application_id && (
              <TouchableOpacity onPress={() => setStatementTarget(entry.application_id)}>
                <Text style={[styles.addStatement, { color: c.accent }]}>add your statement →</Text>
              </TouchableOpacity>
            )}

            {statementTarget === entry.application_id && (
              <View style={{ marginTop: 10, gap: 8 }}>
                <TextInput
                  value={statementText}
                  onChangeText={setStatementText}
                  placeholder="your statement..."
                  placeholderTextColor={c.muted}
                  multiline
                  style={[styles.statementInput, { color: c.text, borderColor: c.border, backgroundColor: c.panel }]}
                />
                <TouchableOpacity
                  onPress={handleSubmitStatement}
                  disabled={!statementText.trim() || submittingStatement}
                  style={[styles.submitBtn, { borderColor: c.accent, opacity: statementText.trim() ? 1 : 0.4 }]}
                >
                  <Text style={[styles.submitBtnText, { color: c.accent }]}>
                    {submittingStatement ? '...' : 'submit →'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { fontSize: 22 },
  headerTitle: { fontSize: 17, fontFamily: fonts.playfair },
  sectionLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  jobTitle: { fontSize: 26, fontFamily: fonts.playfair, marginBottom: 4 },
  pay: { fontSize: 18, fontFamily: fonts.dmMono, marginBottom: 12 },
  description: { fontSize: 14, fontFamily: fonts.dmSans, lineHeight: 22, marginBottom: 20 },
  applyBtn: {
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  applyBtnText: { fontSize: 13, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  emptyLedger: { fontSize: 14, fontFamily: fonts.playfairItalic, marginTop: 8 },
  ledgerEntry: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  ledgerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  ledgerName: { fontSize: 15, fontFamily: fonts.playfair },
  ledgerStatus: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  ledgerRole: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  statementBox: { marginTop: 8, borderRadius: 8, padding: 10, gap: 3 },
  statementLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.2, textTransform: 'uppercase' },
  statementText: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20 },
  addStatement: { fontSize: 11, fontFamily: fonts.dmMono, marginTop: 8 },
  statementInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    fontFamily: fonts.dmSans,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitBtn: { borderWidth: 1, borderRadius: 20, paddingVertical: 8, alignItems: 'center' },
  submitBtnText: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
});
