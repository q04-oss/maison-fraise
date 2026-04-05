import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import {
  acceptTokenOffer,
  declineTokenOffer,
  fetchMyTokenOffers,
  fetchMyTokens,
  acceptContentTokenOffer,
  declineContentTokenOffer,
  fetchMyContentTokenOffers,
  fetchMyContentTokens,
} from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';
import { TokenCard, TokenCardData, TokenVisual } from '../TokenVisual';
import { composeTokenName, ARCHETYPE_COLORS, RARITY_LABELS } from '../../lib/tokenAlgorithm';

type Tab = 'tokens' | 'cards' | 'offers';

function mapToken(t: any): TokenCardData {
  return {
    tokenId: t.id,
    tokenNumber: String(t.token_number).padStart(4, '0'),
    varietyName: t.variety_name ?? '',
    amountCents: t.excess_amount_cents ?? 0,
    date: t.minted_at?.slice(0, 10) ?? '',
    originalOwner: t.original_owner_display_name ?? 'unknown',
    size: t.visual_size ?? 30,
    color: t.visual_color ?? '#FFCDD2',
    seeds: t.visual_seeds ?? 8,
    irregularity: t.visual_irregularity ?? 15,
    tokenType: t.token_type,
    partnerName: t.partner_name,
    locationType: t.location_type,
  };
}

export default function TokensPanel() {
  const { goBack, showPanel } = usePanel();
  const c = useColors();
  const [tab, setTab] = useState<Tab>('tokens');
  const [myTokens, setMyTokens] = useState<TokenCardData[]>([]);
  const [myCards, setMyCards] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [cardOffers, setCardOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [offersLoading, setOffersLoading] = useState(true);
  const [actingOffer, setActingOffer] = useState<number | null>(null);
  const [actingCardOffer, setActingCardOffer] = useState<number | null>(null);

  useEffect(() => {
    fetchMyTokens()
      .then(data => setMyTokens(data.map(mapToken)))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetchMyContentTokens()
      .then(setMyCards)
      .catch(() => {})
      .finally(() => setCardsLoading(false));

    fetchMyTokenOffers()
      .then(setOffers)
      .catch(() => {})
      .finally(() => setOffersLoading(false));

    fetchMyContentTokenOffers()
      .then(setCardOffers)
      .catch(() => {});
  }, []);

  const handleAccept = async (offerId: number) => {
    setActingOffer(offerId);
    try {
      await acceptTokenOffer(offerId);
      const accepted = offers.find(o => o.id === offerId);
      setOffers(prev => prev.filter(o => o.id !== offerId));
      if (accepted?.token) {
        setMyTokens(prev => [mapToken(accepted.token), ...prev]);
      }
    } catch {}
    setActingOffer(null);
  };

  const handleDecline = async (offerId: number) => {
    setActingOffer(offerId);
    try {
      await declineTokenOffer(offerId);
      setOffers(prev => prev.filter(o => o.id !== offerId));
    } catch {}
    setActingOffer(null);
  };

  const handleAcceptCard = async (offerId: number) => {
    setActingCardOffer(offerId);
    try {
      await acceptContentTokenOffer(offerId);
      const accepted = cardOffers.find(o => o.id === offerId);
      setCardOffers(prev => prev.filter(o => o.id !== offerId));
      if (accepted?.token) {
        setMyCards(prev => [accepted.token, ...prev]);
      }
    } catch {}
    setActingCardOffer(null);
  };

  const handleDeclineCard = async (offerId: number) => {
    setActingCardOffer(offerId);
    try {
      await declineContentTokenOffer(offerId);
      setCardOffers(prev => prev.filter(o => o.id !== offerId));
    } catch {}
    setActingCardOffer(null);
  };

  const renderToken = ({ item }: { item: TokenCardData }) => (
    <View style={styles.tokenCell}>
      <TokenCard
        data={item}
        onPress={() => showPanel('token-detail', { tokenId: item.tokenId })}
      />
    </View>
  );

  const renderCardOffer = ({ item: offer }: { item: any }) => {
    const t = offer.token;
    const acting = actingCardOffer === offer.id;
    return (
      <View style={[styles.offerRow, { borderBottomColor: c.border }]}>
        <View style={styles.offerLeft}>
          {t && (
            <TokenVisual
              tokenId={t.id}
              size={t.visual_size ?? 30}
              color={t.visual_color ?? '#FFCDD2'}
              seeds={t.visual_seeds ?? 8}
              irregularity={t.visual_irregularity ?? 15}
              width={56}
            />
          )}
        </View>
        <View style={styles.offerMid}>
          <Text style={[styles.offerName, { color: c.text }]} numberOfLines={1}>
            card #{String(t?.token_number ?? 0).padStart(4, '0')} · {t?.mechanic_archetype ?? ''}
          </Text>
          <Text style={[styles.offerFrom, { color: c.muted }]} numberOfLines={1}>
            from @{offer.from_user_display_name ?? 'unknown'}
          </Text>
          {!!offer.note && (
            <Text style={[styles.offerNote, { color: c.muted }]} numberOfLines={2}>
              "{offer.note}"
            </Text>
          )}
        </View>
        <View style={styles.offerActions}>
          {acting ? (
            <ActivityIndicator size="small" color={c.accent} />
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: c.accent }]}
                onPress={() => handleAcceptCard(offer.id)}
                activeOpacity={0.75}
              >
                <Text style={styles.actionBtnText}>accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnOutline, { borderColor: c.border }]}
                onPress={() => handleDeclineCard(offer.id)}
                activeOpacity={0.75}
              >
                <Text style={[styles.actionBtnText, { color: c.muted }]}>decline</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  const renderOffer = ({ item: offer }: { item: any }) => {
    const t = offer.token;
    const acting = actingOffer === offer.id;
    const displayName = t
      ? composeTokenName({
          token_type: t.token_type,
          location_type: t.location_type,
          partner_name: t.partner_name,
          variety_name: t.variety_name ?? '',
        })
      : '';

    return (
      <View style={[styles.offerRow, { borderBottomColor: c.border }]}>
        <View style={styles.offerLeft}>
          {t && (
            <TokenVisual
              tokenId={t.id}
              size={t.visual_size ?? 30}
              color={t.visual_color ?? '#FFCDD2'}
              seeds={t.visual_seeds ?? 8}
              irregularity={t.visual_irregularity ?? 15}
              width={56}
              tokenType={t.token_type}
            />
          )}
        </View>
        <View style={styles.offerMid}>
          <Text style={[styles.offerName, { color: c.text }]} numberOfLines={1}>
            #{String(t?.token_number ?? 0).padStart(4, '0')} · {displayName}
          </Text>
          <Text style={[styles.offerFrom, { color: c.muted }]} numberOfLines={1}>
            from @{offer.from_user_display_name ?? 'unknown'}
          </Text>
          {!!offer.note && (
            <Text style={[styles.offerNote, { color: c.muted }]} numberOfLines={2}>
              "{offer.note}"
            </Text>
          )}
        </View>
        <View style={styles.offerActions}>
          {acting ? (
            <ActivityIndicator size="small" color={c.accent} />
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: c.accent }]}
                onPress={() => handleAccept(offer.id)}
                activeOpacity={0.75}
              >
                <Text style={styles.actionBtnText}>accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnOutline, { borderColor: c.border }]}
                onPress={() => handleDecline(offer.id)}
                activeOpacity={0.75}
              >
                <Text style={[styles.actionBtnText, { color: c.muted }]}>decline</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: c.text }]}>tokens</Text>
        </View>
        <TouchableOpacity onPress={() => showPanel('creator-earnings')} style={styles.earningsBtn} activeOpacity={0.7}>
          <Text style={[styles.earningsLabel, { color: c.muted }]}>earnings</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.tabs, { borderBottomColor: c.border }]}>
        {([
          ['tokens', 'strawberries', myTokens.length] as const,
          ['cards', 'cards', myCards.length] as const,
          ['offers', 'offers', offers.length + cardOffers.length] as const,
        ] as [Tab, string, number][]).map(([key, label, count]) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, tab === key && { borderBottomColor: c.accent, borderBottomWidth: 2 }]}
            onPress={() => setTab(key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabText, { color: tab === key ? c.accent : c.muted }]}>
              {label}{count > 0 ? ` (${count})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'tokens' ? (
        loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : myTokens.length === 0 ? (
          <Text style={[styles.empty, { color: c.muted }]}>
            no tokens yet — collect an order to mint your first
          </Text>
        ) : (
          <FlatList
            data={myTokens}
            keyExtractor={item => String(item.tokenId)}
            renderItem={renderToken}
            numColumns={2}
            columnWrapperStyle={styles.columnWrapper}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : tab === 'cards' ? (
        cardsLoading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : myCards.length === 0 ? (
          <Text style={[styles.empty, { color: c.muted }]}>
            no cards yet — cards are minted when creators publish portal content
          </Text>
        ) : (
          <FlatList
            data={myCards}
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.cardRow, { borderBottomColor: c.border }]}
                onPress={() => showPanel('token-detail', { tokenId: item.id, isCard: true })}
                activeOpacity={0.75}
              >
                <TokenVisual
                  tokenId={item.id}
                  size={item.visual_size ?? 30}
                  color={item.visual_color ?? '#FFCDD2'}
                  seeds={item.visual_seeds ?? 8}
                  irregularity={item.visual_irregularity ?? 15}
                  width={52}
                />
                <View style={styles.cardMeta}>
                  <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={1}>
                    card #{String(item.token_number).padStart(4, '0')} · @{item.creator_display_name}
                  </Text>
                  <View style={styles.cardBadges}>
                    <View style={[styles.badge, { backgroundColor: ARCHETYPE_COLORS[item.mechanic_archetype as keyof typeof ARCHETYPE_COLORS] ?? '#888' }]}>
                      <Text style={styles.badgeText}>{item.mechanic_archetype}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: item.mechanic_rarity === 'legendary' ? '#C9973A' : item.mechanic_rarity === 'rare' ? '#7B1FA2' : '#555' }]}>
                      <Text style={styles.badgeText}>{RARITY_LABELS[item.mechanic_rarity as keyof typeof RARITY_LABELS]}</Text>
                    </View>
                  </View>
                  <Text style={[styles.cardEffect, { color: c.muted }]} numberOfLines={1}>
                    {item.mechanic_effect}
                  </Text>
                </View>
                <Text style={[styles.cardPower, { color: c.text }]}>{item.mechanic_power}</Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : offersLoading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : (offers.length + cardOffers.length) === 0 ? (
        <Text style={[styles.empty, { color: c.muted }]}>no pending offers</Text>
      ) : (
        <FlatList
          data={[
            ...offers.map(o => ({ ...o, _kind: 'token' })),
            ...cardOffers.map(o => ({ ...o, _kind: 'card' })),
          ]}
          keyExtractor={o => `${o._kind}-${o.id}`}
          renderItem={({ item: offer }) =>
            offer._kind === 'token'
              ? renderOffer({ item: offer })
              : renderCardOffer({ item: offer })
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
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
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingVertical: 4 },
  backArrow: { fontSize: 28, lineHeight: 34 },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { textAlign: 'center', fontSize: 17, fontFamily: fonts.playfair },
  headerSpacer: { width: 28 },
  earningsBtn: { paddingVertical: 4 },
  earningsLabel: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  empty: {
    textAlign: 'center',
    marginTop: 60,
    fontSize: 13,
    fontFamily: fonts.dmSans,
    fontStyle: 'italic',
    paddingHorizontal: SPACING.md,
  },
  gridContent: { padding: SPACING.md, paddingBottom: 40 },
  columnWrapper: { gap: 12, marginBottom: 12 },
  tokenCell: { flex: 1, alignItems: 'center' },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  offerLeft: { width: 56, alignItems: 'center' },
  offerMid: { flex: 1, gap: 3 },
  offerName: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  offerFrom: { fontSize: 10, fontFamily: fonts.dmMono },
  offerNote: { fontSize: 10, fontFamily: fonts.dmSans, fontStyle: 'italic', marginTop: 2 },
  offerActions: { gap: 6, alignItems: 'center' },
  actionBtn: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBtnOutline: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 10, fontFamily: fonts.dmMono, color: '#fff', letterSpacing: 0.5 },
  // card list
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  cardMeta: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  cardBadges: { flexDirection: 'row', gap: 4 },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontFamily: fonts.dmMono, color: '#fff', letterSpacing: 0.5 },
  cardEffect: { fontSize: 10, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  cardPower: { fontSize: 22, fontFamily: fonts.playfair, width: 40, textAlign: 'right' },
});
