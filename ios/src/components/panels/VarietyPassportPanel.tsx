import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchVarietyPassport, fetchVarietyARVideos, fetchVarietyReviews, submitVarietyReview } from '../../lib/api';

interface ARVideo {
  video_id: string | number;
  title: string;
}

interface Reviews {
  avg_rating: number | null;
  review_count: number;
}

interface PassportEntry {
  variety_id: string | number;
  name: string;
  source_farm?: string;
  first_tried?: string;
}

function PassportCard({ item }: { item: PassportEntry }) {
  const c = useColors();
  const [arVideos, setArVideos] = useState<ARVideo[]>([]);
  const [reviews, setReviews] = useState<Reviews | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const varietyIdNum = Number(item.variety_id);

  const loadReviews = () => {
    fetchVarietyReviews(varietyIdNum)
      .then((data: any) => setReviews(data ?? null))
      .catch(() => setReviews(null));
  };

  useEffect(() => {
    fetchVarietyARVideos(varietyIdNum)
      .then((data: any) => {
        const videos = Array.isArray(data) ? data : (data?.videos ?? []);
        setArVideos(videos.slice(0, 3));
      })
      .catch(() => setArVideos([]));

    loadReviews();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [varietyIdNum]);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Rating required', 'Please select a star rating before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      await submitVarietyReview(varietyIdNum, rating, note);
      setShowForm(false);
      setRating(0);
      setNote('');
      loadReviews();
    } catch {
      Alert.alert('Error', 'Could not submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[cardStyles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[cardStyles.varietyName, { color: c.text, fontFamily: fonts.playfair }]}>{item.name}</Text>

      {item.source_farm ? (
        <Text style={[cardStyles.farm, { color: c.muted, fontFamily: fonts.dmMono }]}>{item.source_farm}</Text>
      ) : null}

      {reviews && reviews.review_count > 0 ? (
        <Text style={[cardStyles.reviewSummary, { color: c.accent, fontFamily: fonts.dmMono }]}>
          {'★ '}
          {typeof reviews.avg_rating === 'number' ? reviews.avg_rating.toFixed(1) : '—'}
          {' ('}
          {reviews.review_count}
          {')'}
        </Text>
      ) : (
        <Text style={[cardStyles.reviewSummary, { color: c.muted, fontFamily: fonts.dmMono }]}>No reviews yet</Text>
      )}

      {item.first_tried ? (
        <Text style={[cardStyles.date, { color: c.muted, fontFamily: fonts.dmSans }]}>
          First tried: {new Date(item.first_tried).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}
        </Text>
      ) : null}

      {arVideos.length > 0 && (
        <View style={cardStyles.chipsRow}>
          {arVideos.map(video => (
            <View
              key={String(video.video_id)}
              style={[cardStyles.chip, { borderColor: c.border }]}
            >
              <Text style={[cardStyles.chipText, { color: c.muted, fontFamily: fonts.dmMono }]}>
                {'▶ '}
                {video.title}
              </Text>
            </View>
          ))}
        </View>
      )}

      {!showForm && (
        <TouchableOpacity onPress={() => setShowForm(true)} activeOpacity={0.7} style={cardStyles.writeReviewBtn}>
          <Text style={[cardStyles.writeReviewText, { color: c.accent, fontFamily: fonts.dmMono }]}>WRITE A REVIEW</Text>
        </TouchableOpacity>
      )}

      {showForm && (
        <View style={cardStyles.reviewForm}>
          <View style={cardStyles.starsRow}>
            {[1, 2, 3, 4, 5].map(star => (
              <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
                <Text style={[cardStyles.star, { color: star <= rating ? c.accent : c.muted }]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[cardStyles.noteInput, { borderBottomColor: c.border, color: c.text, fontFamily: fonts.dmSans }]}
            placeholder="Add a note..."
            placeholderTextColor={c.muted}
            value={note}
            onChangeText={setNote}
            multiline
          />
          <View style={cardStyles.formFooter}>
            <TouchableOpacity onPress={() => { setShowForm(false); setRating(0); setNote(''); }} activeOpacity={0.7}>
              <Text style={[cardStyles.cancelText, { color: c.muted, fontFamily: fonts.dmMono }]}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSubmit} disabled={submitting} activeOpacity={0.7}>
              <Text style={[cardStyles.submitText, { color: c.accent, fontFamily: fonts.dmMono }]}>
                {submitting ? '...' : 'REVIEW'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md,
    gap: 4,
  },
  varietyName: {
    fontSize: 20,
  },
  farm: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  reviewSummary: {
    fontSize: 10,
  },
  date: {
    fontSize: 12,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 9,
  },
  writeReviewBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  writeReviewText: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  reviewForm: {
    marginTop: 8,
    gap: 4,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  star: {
    fontSize: 22,
  },
  noteInput: {
    fontSize: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    marginBottom: 6,
  },
  formFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  submitText: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
});

export default function VarietyPassportPanel() {
  const { goBack } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [passport, setPassport] = useState<PassportEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVarietyPassport()
      .then(data => setPassport((data as any)?.varieties ?? data))
      .catch(() => setPassport([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top + 16 }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text, fontFamily: fonts.dmMono }]}>VARIETY PASSPORT</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading && (
        <View style={styles.center}><ActivityIndicator color={c.accent} /></View>
      )}

      {!loading && passport.length === 0 && (
        <View style={styles.center}>
          <Text style={[styles.empty, { color: c.muted, fontFamily: fonts.dmSans }]}>
            Collect your first order to start your passport.
          </Text>
        </View>
      )}

      {!loading && passport.length > 0 && (
        <FlatList
          data={passport}
          keyExtractor={item => String(item.variety_id)}
          renderItem={({ item }) => <PassportCard item={item} />}
          ListHeaderComponent={
            <View style={styles.countRow}>
              <Text style={[styles.countNum, { color: c.accent, fontFamily: fonts.playfair }]}>{passport.length}</Text>
              <Text style={[styles.countLabel, { color: c.muted, fontFamily: fonts.dmMono }]}>VARIETIES COLLECTED</Text>
            </View>
          }
          contentContainerStyle={styles.list}
          initialNumToRender={4}
          maxToRenderPerBatch={3}
          windowSize={5}
          showsVerticalScrollIndicator={false}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg },
  empty: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  countRow: { alignItems: 'center', paddingVertical: SPACING.lg, gap: 4 },
  countNum: { fontSize: 64, lineHeight: 72 },
  countLabel: { fontSize: 11, letterSpacing: 2 },
  list: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, gap: SPACING.sm },
});
