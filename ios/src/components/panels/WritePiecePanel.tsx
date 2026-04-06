import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { submitAbstract, submitFullPiece, fetchMyPieces } from '../../lib/api';

const TAGS = ['Harvest', 'Portrait', 'Criticism', 'Dispatch', 'Essay'];

const STATUS_LABELS: Record<string, string> = {
  abstract_submitted: 'Under consideration',
  abstract_declined: 'Not accepted',
  commissioned: 'Commissioned',
  draft: 'Draft',
  submitted: 'Pending review',
  published: 'Published',
  declined: 'Not accepted',
};

const STATUS_COLORS: Record<string, string> = {
  abstract_submitted: '#C9973A',
  abstract_declined: '#FF3B30',
  commissioned: '#007AFF',
  draft: '#8E8E93',
  submitted: '#C9973A',
  published: '#34C759',
  declined: '#FF3B30',
};

function formatDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Sub-screens ──────────────────────────────────────────────────────────────

function AbstractForm({ onSubmitted }: { onSubmitted: () => void }) {
  const c = useColors();
  const [abstract, setAbstract] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const len = abstract.length;
  const canSubmit = len >= 50 && len <= 600 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await submitAbstract(abstract.trim(), selectedTag);
      onSubmitted();
    } catch (err: any) {
      if (err?.error === 'membership_required') {
        Alert.alert('Membership required', 'An active membership is required to pitch editorial pieces.');
      } else if (err?.error === 'abstract_pending') {
        Alert.alert('Already submitted', 'You already have an abstract under consideration.');
        onSubmitted();
      } else {
        Alert.alert('Error', 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Text style={[styles.sectionLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>
        PITCH YOUR PIECE
      </Text>
      <Text style={[styles.hint, { color: c.muted, fontFamily: fonts.dmSans }]}>
        Tell us what you want to write. We consider every abstract and commission pieces case by case.
      </Text>

      <TextInput
        style={[styles.abstractInput, { color: c.text, fontFamily: fonts.dmSans, borderColor: c.border }]}
        placeholder="Your abstract…"
        placeholderTextColor={c.muted}
        value={abstract}
        onChangeText={setAbstract}
        multiline
        textAlignVertical="top"
        maxLength={600}
      />
      <Text style={[styles.charCount, { fontFamily: fonts.dmMono, color: canSubmit ? c.accent : c.muted }]}>
        {len} / 600{len < 50 ? ` (min 50)` : ''}
      </Text>

      <View style={styles.tagRow}>
        {TAGS.map(tag => {
          const active = tag === selectedTag;
          return (
            <TouchableOpacity
              key={tag}
              onPress={() => setSelectedTag(active ? null : tag)}
              activeOpacity={0.7}
              style={[styles.tagPill, { backgroundColor: active ? c.accent : 'transparent', borderColor: c.border }]}
            >
              <Text style={[styles.tagText, { fontFamily: fonts.dmMono, color: active ? '#FFFFFF' : c.muted }]}>
                {tag}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: canSubmit ? c.accent : c.card, borderColor: c.border }]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        activeOpacity={0.8}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={[styles.submitText, { fontFamily: fonts.dmMono, color: canSubmit ? '#FFFFFF' : c.muted }]}>
            Submit abstract
          </Text>
        )}
      </TouchableOpacity>
    </>
  );
}

function WriteForm({ piece, onSubmitted }: { piece: any; onSubmitted: () => void }) {
  const c = useColors();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const bodyLen = body.length;
  const canSubmit = title.trim().length > 0 && bodyLen >= 100 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await submitFullPiece(piece.id, title.trim(), body);
      onSubmitted();
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {piece.editor_note ? (
        <View style={[styles.editorNote, { borderColor: c.accent, backgroundColor: `${c.accent}10` }]}>
          <Text style={[styles.editorNoteLabel, { color: c.accent, fontFamily: fonts.dmMono }]}>EDITOR'S NOTE</Text>
          <Text style={[styles.editorNoteText, { color: c.text, fontFamily: fonts.dmSans }]}>{piece.editor_note}</Text>
        </View>
      ) : null}

      <Text style={[styles.sectionLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>
        WRITE YOUR PIECE
      </Text>
      {piece.abstract ? (
        <Text style={[styles.hint, { color: c.muted, fontFamily: fonts.dmSans }]} numberOfLines={3}>
          Abstract: {piece.abstract}
        </Text>
      ) : null}

      <TextInput
        style={[styles.titleInput, { color: c.text, fontFamily: fonts.playfair, borderBottomColor: c.border }]}
        placeholder="Title"
        placeholderTextColor={c.muted}
        value={title}
        onChangeText={setTitle}
        returnKeyType="next"
      />

      <TextInput
        style={[styles.bodyInput, { color: c.text, fontFamily: fonts.dmSans, borderColor: c.border }]}
        placeholder="Write your piece…"
        placeholderTextColor={c.muted}
        value={body}
        onChangeText={setBody}
        multiline
        textAlignVertical="top"
      />
      <Text style={[styles.charCount, { fontFamily: fonts.dmMono, color: bodyLen >= 100 ? c.accent : c.muted }]}>
        {bodyLen} {bodyLen < 100 ? '/ 100 min' : 'chars'}
      </Text>

      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: canSubmit ? c.accent : c.card, borderColor: c.border }]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        activeOpacity={0.8}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={[styles.submitText, { fontFamily: fonts.dmMono, color: canSubmit ? '#FFFFFF' : c.muted }]}>
            Submit for review
          </Text>
        )}
      </TouchableOpacity>
    </>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function WritePiecePanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [myPieces, setMyPieces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchMyPieces()
      .then(setMyPieces)
      .catch(() => setMyPieces([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Derive state from pieces
  const pendingAbstract = myPieces.find(p => p.status === 'abstract_submitted');
  const commissioned = myPieces.find(p => p.status === 'commissioned' || p.status === 'draft');
  const pastPieces = myPieces.filter(p =>
    p.status !== 'abstract_submitted' && p.status !== 'commissioned' && p.status !== 'draft'
  );

  const renderBody = () => {
    if (loading) {
      return <ActivityIndicator color={c.accent} style={{ marginTop: SPACING.xl }} />;
    }

    // Abstract under review — waiting state
    if (pendingAbstract) {
      return (
        <View style={styles.waitingContainer}>
          <Text style={[styles.waitingKanji, { color: c.accent }]}>稿</Text>
          <Text style={[styles.waitingTitle, { color: c.text, fontFamily: fonts.playfair }]}>Under consideration.</Text>
          <Text style={[styles.waitingBody, { color: c.muted, fontFamily: fonts.dmSans }]}>
            We've received your abstract{pendingAbstract.tag ? ` (${pendingAbstract.tag})` : ''}. We'll be in touch.
          </Text>
          {pendingAbstract.abstract ? (
            <Text style={[styles.abstractPreview, { color: c.muted, fontFamily: fonts.dmSans, borderColor: c.border }]} numberOfLines={4}>
              {pendingAbstract.abstract}
            </Text>
          ) : null}
        </View>
      );
    }

    // Commissioned — show write form
    if (commissioned) {
      return <WriteForm piece={commissioned} onSubmitted={load} />;
    }

    // Default — show abstract pitch form
    return <AbstractForm onSubmitted={load} />;
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.text, fontFamily: fonts.dmMono }]}>WRITE</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderBody()}

        {/* Past pieces */}
        {!loading && pastPieces.length > 0 && (
          <>
            <View style={[styles.divider, { borderTopColor: c.border }]}>
              <Text style={[styles.sectionLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>MY PIECES</Text>
            </View>
            {pastPieces.map(item => {
              const statusKey = item.status ?? 'draft';
              const statusColor = STATUS_COLORS[statusKey] ?? '#8E8E93';
              const statusLabel = STATUS_LABELS[statusKey] ?? statusKey;
              return (
                <View key={String(item.id)} style={[styles.pieceRow, { borderBottomColor: c.border }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.pieceTitle, { color: c.text, fontFamily: fonts.playfair }]} numberOfLines={1}>
                      {item.title ?? item.abstract ?? '—'}
                    </Text>
                    <Text style={[styles.pieceDate, { color: c.muted, fontFamily: fonts.dmMono }]}>
                      {formatDate(item.created_at)}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { borderColor: statusColor }]}>
                    <Text style={[styles.statusText, { color: statusColor, fontFamily: fonts.dmMono }]}>
                      {statusLabel}
                    </Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingTop: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { fontSize: 28 },
  headerTitle: { fontSize: 14, letterSpacing: 2 },
  body: { paddingHorizontal: SPACING.md, paddingTop: SPACING.lg },
  sectionLabel: { fontSize: 12, letterSpacing: 2, marginBottom: SPACING.sm },
  hint: { fontSize: 13, lineHeight: 19, marginBottom: SPACING.md, opacity: 0.8 },
  abstractInput: {
    fontSize: 15, lineHeight: 22, height: 140,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    padding: SPACING.sm, marginBottom: SPACING.xs,
  },
  charCount: { fontSize: 12, letterSpacing: 0.5, textAlign: 'right', marginBottom: SPACING.md },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.md },
  tagPill: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  tagText: { fontSize: 12, letterSpacing: 0.5 },
  submitBtn: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14, alignItems: 'center', marginBottom: SPACING.xl,
  },
  submitText: { fontSize: 14, letterSpacing: 1 },
  // Waiting state
  waitingContainer: { alignItems: 'center', paddingVertical: SPACING.xl },
  waitingKanji: { fontSize: 48, marginBottom: SPACING.md },
  waitingTitle: { fontSize: 20, marginBottom: SPACING.sm },
  waitingBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: SPACING.lg, opacity: 0.7 },
  abstractPreview: {
    fontSize: 13, lineHeight: 19, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8, padding: SPACING.sm, opacity: 0.6,
  },
  // Editor note
  editorNote: {
    borderLeftWidth: 2, paddingLeft: SPACING.sm, paddingVertical: SPACING.xs,
    marginBottom: SPACING.md,
  },
  editorNoteLabel: { fontSize: 10, letterSpacing: 1.5, marginBottom: 4 },
  editorNoteText: { fontSize: 13, lineHeight: 19 },
  // Write form
  titleInput: {
    fontSize: 22, lineHeight: 30, paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: SPACING.md,
  },
  bodyInput: {
    fontSize: 15, lineHeight: 22, height: 220,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10,
    padding: SPACING.sm, marginBottom: SPACING.xs,
  },
  // Past pieces
  divider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: SPACING.md, marginBottom: SPACING.sm },
  pieceRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, gap: SPACING.sm,
  },
  pieceTitle: { fontSize: 15 },
  pieceDate: { fontSize: 11, letterSpacing: 0.3 },
  statusBadge: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, letterSpacing: 0.5 },
});
