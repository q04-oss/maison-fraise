import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchEditorialPiece } from '../../lib/api';

const API_BASE = 'https://maison-fraise-v2-production.up.railway.app';

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatCents(cents: number) {
  return `CA$${(cents / 100).toFixed(2)}`;
}

export default function EditorialPiecePanel() {
  const { goBack, panelData, showPanel, setPanelData } = usePanel();
  const c = useColors();
  const insets = useSafeAreaInsets();

  const [piece, setPiece] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const pieceId: number | undefined = panelData?.pieceId;

  useEffect(() => {
    if (pieceId == null) {
      setError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    fetchEditorialPiece(pieceId)
      .then(data => {
        if (!data) {
          setError(true);
        } else {
          setPiece(data);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [pieceId]);

  const handleShare = async () => {
    if (!piece) return;
    try {
      await Share.share({
        title: piece.title,
        message: piece.title,
        url: `${API_BASE}/editorial/${piece.id}`,
      });
    } catch {
      // dismissed or failed — no-op
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7}>
          <Text style={[styles.back, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {piece && (
          <TouchableOpacity onPress={handleShare} activeOpacity={0.7}>
            <Text style={[styles.shareBtn, { color: c.accent }]}>↑</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      )}

      {!loading && error && (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: c.muted, fontFamily: fonts.dmSans }]}>
            Could not load this piece.
          </Text>
        </View>
      )}

      {!loading && !error && piece && (
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.pieceTitle, { color: c.text, fontFamily: fonts.playfair }]}>
            {piece.title}
          </Text>

          <View style={styles.metaRow}>
            {piece.author_user_id ? (
              <TouchableOpacity
                onPress={() => { setPanelData({ userId: piece.author_user_id }); showPanel('user-profile'); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.metaLink, { color: c.accent, fontFamily: fonts.dmMono }]}>
                  {piece.author_display_name ?? 'Anonymous'}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.meta, { color: c.muted, fontFamily: fonts.dmMono }]}>
                {piece.author_display_name ?? 'Anonymous'}
              </Text>
            )}
            <Text style={[styles.meta, { color: c.muted, fontFamily: fonts.dmMono }]}>
              {' · '}{formatDate(piece.published_at ?? piece.created_at)}
            </Text>
          </View>

          <View style={styles.badgeRow}>
            {piece.commission_cents != null && (
              <View
                style={[
                  styles.commissionBadge,
                  { backgroundColor: c.card, borderColor: c.border },
                ]}
              >
                <Text style={[styles.commissionText, { color: c.accent, fontFamily: fonts.dmMono }]}>
                  Commissioned at {formatCents(piece.commission_cents)}
                </Text>
              </View>
            )}

            {piece.tag ? (
              <View style={[styles.tagPill, { borderColor: c.border }]}>
                <Text style={[styles.tagText, { color: c.muted, fontFamily: fonts.dmMono }]}>
                  {piece.tag}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={[styles.bodyText, { color: c.text, fontFamily: fonts.dmSans }]}>
            {piece.body}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { fontSize: 28 },
  shareBtn: { fontSize: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14 },
  body: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  pieceTitle: { fontSize: 24, lineHeight: 32 },
  meta: { fontSize: 13, letterSpacing: 0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  metaLink: { fontSize: 13, letterSpacing: 0.3 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: 2 },
  commissionBadge: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  commissionText: { fontSize: 12, letterSpacing: 0.3 },
  tagPill: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { fontSize: 11, letterSpacing: 0.5 },
  bodyText: { fontSize: 16, lineHeight: 26, marginTop: SPACING.sm },
});
