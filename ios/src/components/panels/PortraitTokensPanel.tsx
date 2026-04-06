import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import { fetchMyPortraitTokens } from '../../lib/api';

export default function PortraitTokensPanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyPortraitTokens()
      .then(setTokens)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>PORTRAIT TOKENS</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : tokens.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: c.text }]}>No portrait tokens yet</Text>
            <Text style={[styles.emptyBody, { color: c.muted }]}>
              Portrait tokens are minted after a sponsored blowout photo shoot.
              Each token is a one-of-one NFT that you own.
              Businesses can license your portrait, and you earn per impression.
            </Text>
          </View>
        ) : (
          tokens.map((token: any) => (
            <TouchableOpacity
              key={token.id}
              style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
              onPress={() => showPanel('portrait-token-detail', { tokenId: token.id })}
              activeOpacity={0.75}
            >
              <View style={styles.cardRow}>
                {token.image_url ? (
                  <Image
                    source={{ uri: token.image_url }}
                    style={styles.thumb}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: c.border }]} />
                )}
                <View style={styles.cardInfo}>
                  <Text style={[styles.tokenId, { color: c.muted }]}>
                    TOKEN #{String(token.id).padStart(4, '0')}
                  </Text>
                  {token.shot_at && (
                    <Text style={[styles.shotDate, { color: c.muted }]}>
                      {new Date(token.shot_at).toLocaleDateString('en-CA', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </Text>
                  )}
                  <View style={styles.badges}>
                    {token.active_license_count > 0 && (
                      <View style={[styles.badge, { backgroundColor: c.accent }]}>
                        <Text style={styles.badgeText}>
                          {token.active_license_count} ACTIVE LICENSE{token.active_license_count > 1 ? 'S' : ''}
                        </Text>
                      </View>
                    )}
                    {token.pending_request_count > 0 && (
                      <View style={[styles.badge, { backgroundColor: '#C5705D' }]}>
                        <Text style={styles.badgeText}>
                          {token.pending_request_count} REQUEST{token.pending_request_count > 1 ? 'S' : ''}
                        </Text>
                      </View>
                    )}
                    {token.status === 'listed' && (
                      <View style={[styles.badge, { backgroundColor: c.muted }]}>
                        <Text style={styles.badgeText}>LISTED</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={[styles.chevron, { color: c.accent }]}>→</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40 },
  backText: { fontSize: 22 },
  title: {
    fontFamily: fonts.dmMono,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  scroll: {
    padding: SPACING.md,
    paddingBottom: 60,
  },
  empty: {
    marginTop: 60,
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  emptyTitle: {
    fontFamily: fonts.playfair,
    fontSize: 20,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  thumb: {
    width: 64,
    height: 80,
    borderRadius: 6,
  },
  thumbPlaceholder: {},
  cardInfo: { flex: 1, gap: 4 },
  tokenId: {
    fontFamily: fonts.dmMono,
    fontSize: 11,
    letterSpacing: 1,
  },
  shotDate: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: fonts.dmMono,
    fontSize: 9,
    color: '#fff',
    letterSpacing: 0.5,
  },
  chevron: { fontSize: 18 },
});
