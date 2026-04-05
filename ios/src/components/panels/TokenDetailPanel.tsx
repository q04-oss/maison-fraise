import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePanel } from '../../context/PanelContext';
import {
  fetchContacts,
  fetchToken,
  fetchContentToken,
  offerTokenTrade,
  offerContentTokenTrade,
  requestContentTokenPrint,
} from '../../lib/api';
import { fonts, SPACING, useColors } from '../../theme';
import { composeTokenName, ARCHETYPE_COLORS, RARITY_LABELS } from '../../lib/tokenAlgorithm';
import { TokenVisual } from '../TokenVisual';

export default function TokenDetailPanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();
  const tokenId = panelData?.tokenId as number | undefined;
  const isCard = !!panelData?.isCard;

  const [token, setToken] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [offering, setOffering] = useState(false);
  const [offerSent, setOfferSent] = useState(false);
  const [offerError, setOfferError] = useState('');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printAddress, setPrintAddress] = useState({ name: '', line1: '', city: '', province: '', postal_code: '', country: 'CA' });
  const [printing, setPrinting] = useState(false);
  const [printRequested, setPrintRequested] = useState(false);
  const [printError, setPrintError] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('user_db_id').then(id => {
      if (id) setMyUserId(parseInt(id, 10));
    });
    if (!tokenId) { setLoading(false); return; }
    const fetcher = isCard ? fetchContentToken : fetchToken;
    fetcher(tokenId)
      .then(setToken)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tokenId]);

  const handleOpenTrade = async () => {
    setShowTradeModal(true);
    setSelectedContact(null);
    setOfferSent(false);
    setOfferError('');
    setContactsLoading(true);
    fetchContacts()
      .then(setContacts)
      .catch(() => {})
      .finally(() => setContactsLoading(false));
  };

  const handleSendOffer = async () => {
    if (!selectedContact || !token) return;
    setOffering(true);
    setOfferError('');
    try {
      if (isCard) {
        await offerContentTokenTrade(token.id, selectedContact.id);
      } else {
        await offerTokenTrade(token.id, selectedContact.id);
      }
      setOfferSent(true);
    } catch (e: any) {
      setOfferError(e?.message ?? 'failed to send offer');
    }
    setOffering(false);
  };

  const handleRequestPrint = async () => {
    if (!token) return;
    const { name, line1, city, province, postal_code, country } = printAddress;
    if (!name || !line1 || !city || !province || !postal_code) {
      setPrintError('all address fields are required');
      return;
    }
    setPrinting(true);
    setPrintError('');
    try {
      await requestContentTokenPrint(token.id, { name, line1, city, province, postal_code, country });
      setPrintRequested(true);
    } catch (e: any) {
      setPrintError(e?.message ?? 'print request failed');
    }
    setPrinting(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <PanelHeader onBack={goBack} c={c} />
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!token) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <PanelHeader onBack={goBack} c={c} />
        <Text style={[styles.empty, { color: c.muted }]}>token not found</Text>
      </View>
    );
  }

  const displayName = isCard
    ? `@${token.creator_display_name ?? 'unknown'}`
    : composeTokenName({
        token_type: token.token_type,
        location_type: token.location_type,
        partner_name: token.partner_name,
        variety_name: token.variety_name ?? '',
      });

  const isMine = myUserId !== null && token.current_owner_id === myUserId;
  const mintedDate = token.minted_at?.slice(0, 10) ?? '';
  const hasTrades = Array.isArray(token.trade_history) && token.trade_history.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <PanelHeader onBack={goBack} c={c} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.visualSection}>
          <TokenVisual
            tokenId={token.id}
            size={token.visual_size ?? 30}
            color={token.visual_color ?? '#FFCDD2'}
            seeds={token.visual_seeds ?? 8}
            irregularity={token.visual_irregularity ?? 15}
            width={180}
            tokenType={token.token_type}
          />
        </View>

        <View style={[styles.section, { borderBottomColor: c.border }]}>
          <Text style={[styles.tokenName, { color: c.text }]}>{displayName}</Text>
          <Text style={[styles.tokenNumber, { color: c.muted }]}>
            #{String(token.token_number).padStart(4, '0')}
          </Text>
          {!!token.location_name && (
            <Text style={[styles.meta, { color: c.muted }]}>{token.location_name}</Text>
          )}
          {!!mintedDate && (
            <Text style={[styles.meta, { color: c.muted }]}>minted {mintedDate}</Text>
          )}
          {(token.excess_amount_cents ?? 0) > 0 && (
            <Text style={[styles.meta, { color: c.muted }]}>
              CA${(token.excess_amount_cents / 100).toFixed(2)} over
            </Text>
          )}
        </View>

        <View style={[styles.section, { borderBottomColor: c.border }]}>
          <Text style={[styles.sectionLabel, { color: c.muted }]}>provenance</Text>
          <View style={styles.chain}>
            <ChainEntry
              label="minted"
              name={`@${token.original_owner_display_name ?? 'unknown'}`}
              date={mintedDate}
              c={c}
            />
            {hasTrades && token.trade_history.map((trade: any) => (
              <React.Fragment key={trade.id}>
                <View style={[styles.chainLine, { backgroundColor: c.border }]} />
                <ChainEntry
                  label="traded"
                  name={`@${trade.from_display_name ?? 'unknown'} → @${trade.to_display_name ?? 'unknown'}`}
                  date={trade.traded_at?.slice(0, 10) ?? ''}
                  c={c}
                />
              </React.Fragment>
            ))}
          </View>
        </View>

        {isCard && token.mechanic_archetype && (
          <View style={[styles.section, { borderBottomColor: c.border }]}>
            <Text style={[styles.sectionLabel, { color: c.muted }]}>card mechanic</Text>
            <View style={styles.mechanicRow}>
              <View style={[styles.badge, { backgroundColor: ARCHETYPE_COLORS[token.mechanic_archetype as keyof typeof ARCHETYPE_COLORS] ?? '#888' }]}>
                <Text style={styles.badgeText}>{token.mechanic_archetype}</Text>
              </View>
              <View style={[styles.badge, {
                backgroundColor: token.mechanic_rarity === 'legendary' ? '#C9973A'
                  : token.mechanic_rarity === 'rare' ? '#7B1FA2'
                  : '#555',
              }]}>
                <Text style={styles.badgeText}>{RARITY_LABELS[token.mechanic_rarity as keyof typeof RARITY_LABELS] ?? token.mechanic_rarity}</Text>
              </View>
              <Text style={[styles.mechanicPower, { color: c.text }]}>PWR {token.mechanic_power}</Text>
            </View>
            <Text style={[styles.mechanicEffect, { color: c.muted }]}>{token.mechanic_effect}</Text>
            {token.print_status && (
              <Text style={[styles.meta, { color: c.muted, marginTop: 4 }]}>
                card print: {token.print_status}
              </Text>
            )}
          </View>
        )}

        {isMine && (
          <View style={styles.tradeSection}>
            <TouchableOpacity
              style={[styles.tradeBtn, { borderColor: c.accent }]}
              onPress={handleOpenTrade}
              activeOpacity={0.75}
            >
              <Text style={[styles.tradeBtnText, { color: c.accent }]}>offer to trade</Text>
            </TouchableOpacity>
            {isCard && !token.print_status && (
              <TouchableOpacity
                style={[styles.tradeBtn, { borderColor: c.muted, marginTop: 10 }]}
                onPress={() => setShowPrintModal(true)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tradeBtnText, { color: c.muted }]}>request physical card</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showTradeModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTradeModal(false)}
      >
        <View style={[styles.modal, { backgroundColor: c.panelBg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>send to</Text>
            <TouchableOpacity onPress={() => setShowTradeModal(false)} activeOpacity={0.7}>
              <Text style={[styles.modalClose, { color: c.muted }]}>×</Text>
            </TouchableOpacity>
          </View>

          {offerSent ? (
            <View style={styles.modalCenter}>
              <Text style={[styles.offerSuccess, { color: c.text }]}>
                offer sent to @{selectedContact?.display_name ?? 'contact'}
              </Text>
              <TouchableOpacity
                style={[styles.tradeBtn, { borderColor: c.border, marginTop: 20 }]}
                onPress={() => setShowTradeModal(false)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tradeBtnText, { color: c.muted }]}>done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {contactsLoading ? (
                <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
              ) : contacts.length === 0 ? (
                <Text style={[styles.empty, { color: c.muted }]}>
                  no contacts yet — exchange codes with someone in person first
                </Text>
              ) : (
                <FlatList
                  data={contacts}
                  keyExtractor={item => String(item.id)}
                  renderItem={({ item }) => {
                    const name = item.display_name ?? `user ${item.id}`;
                    const isSelected = selectedContact?.id === item.id;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.contactRow,
                          { borderBottomColor: c.border },
                          isSelected && { backgroundColor: c.accent + '18' },
                        ]}
                        onPress={() => setSelectedContact(item)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.contactName, { color: c.text }]}>@{name}</Text>
                        {isSelected && (
                          <Text style={{ color: c.accent, fontSize: 16 }}>✓</Text>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  contentContainerStyle={{ paddingBottom: 20 }}
                />
              )}

              {!!offerError && (
                <Text style={[styles.offerError, { color: '#B00020' }]}>{offerError}</Text>
              )}

              {selectedContact && (
                <View style={[styles.modalFooter, { borderTopColor: c.border }]}>
                  <TouchableOpacity
                    style={[styles.confirmBtn, { backgroundColor: c.accent }]}
                    onPress={handleSendOffer}
                    disabled={offering}
                    activeOpacity={0.75}
                  >
                    {offering ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.confirmBtnText}>
                        send offer to @{selectedContact.display_name ?? `user ${selectedContact.id}`}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </Modal>

      {/* Print request modal */}
      <Modal
        visible={showPrintModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPrintModal(false)}
      >
        <View style={[styles.modal, { backgroundColor: c.panelBg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: c.border }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>ship physical card</Text>
            <TouchableOpacity onPress={() => setShowPrintModal(false)} activeOpacity={0.7}>
              <Text style={[styles.modalClose, { color: c.muted }]}>×</Text>
            </TouchableOpacity>
          </View>
          {printRequested ? (
            <View style={styles.modalCenter}>
              <Text style={[styles.offerSuccess, { color: c.text }]}>card print requested</Text>
              <Text style={[styles.meta, { color: c.muted, textAlign: 'center', marginTop: 8 }]}>
                we'll be in touch about fulfillment
              </Text>
              <TouchableOpacity
                style={[styles.tradeBtn, { borderColor: c.border, marginTop: 24, width: '100%' }]}
                onPress={() => setShowPrintModal(false)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tradeBtnText, { color: c.muted }]}>done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.printForm}>
              {[
                ['name', 'full name'],
                ['line1', 'address line 1'],
                ['city', 'city'],
                ['province', 'province'],
                ['postal_code', 'postal code'],
              ].map(([field, label]) => (
                <View key={field} style={styles.inputRow}>
                  <Text style={[styles.inputLabel, { color: c.muted }]}>{label}</Text>
                  <TextInput
                    style={[styles.input, { color: c.text, borderColor: c.border }]}
                    value={(printAddress as any)[field]}
                    onChangeText={(val) => setPrintAddress(prev => ({ ...prev, [field]: val }))}
                    placeholderTextColor={c.muted}
                    placeholder={label}
                  />
                </View>
              ))}
              {!!printError && (
                <Text style={[styles.offerError, { color: '#B00020' }]}>{printError}</Text>
              )}
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: c.accent, marginTop: 16 }]}
                onPress={handleRequestPrint}
                disabled={printing}
                activeOpacity={0.75}
              >
                {printing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.confirmBtnText}>request print</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

function PanelHeader({ onBack, c }: { onBack: () => void; c: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.header, { borderBottomColor: c.border }]}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
        <Text style={[styles.backArrow, { color: c.accent }]}>←</Text>
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={[styles.title, { color: c.text }]}>token</Text>
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function ChainEntry({
  label,
  name,
  date,
  c,
}: {
  label: string;
  name: string;
  date: string;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.chainEntry}>
      <Text style={[styles.chainLabel, { color: c.muted }]}>{label}</Text>
      <Text style={[styles.chainName, { color: c.text }]}>{name}</Text>
      {!!date && <Text style={[styles.chainDate, { color: c.muted }]}>{date}</Text>}
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
  scroll: { paddingBottom: 20 },
  visualSection: { alignItems: 'center', paddingVertical: 32 },
  section: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  tokenName: { fontSize: 22, fontFamily: fonts.playfair },
  tokenNumber: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  meta: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  sectionLabel: {
    fontSize: 10,
    fontFamily: fonts.dmMono,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  chain: { gap: 0 },
  chainLine: { width: 1, height: 16, marginLeft: 8 },
  chainEntry: { gap: 2, paddingVertical: 2 },
  chainLabel: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1, textTransform: 'uppercase' },
  chainName: { fontSize: 13, fontFamily: fonts.dmMono },
  chainDate: { fontSize: 10, fontFamily: fonts.dmMono },
  tradeSection: { paddingHorizontal: SPACING.md, paddingTop: 24 },
  tradeBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  tradeBtnText: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 1 },
  empty: {
    textAlign: 'center',
    marginTop: 60,
    fontSize: 13,
    fontFamily: fonts.dmSans,
    fontStyle: 'italic',
    paddingHorizontal: SPACING.md,
  },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontFamily: fonts.playfair },
  modalClose: { fontSize: 28, lineHeight: 34, paddingHorizontal: 4 },
  modalCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactName: { fontSize: 14, fontFamily: fonts.dmMono },
  modalFooter: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 32,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  confirmBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  confirmBtnText: { fontSize: 13, fontFamily: fonts.dmMono, color: '#fff', letterSpacing: 0.5 },
  offerSuccess: { fontSize: 15, fontFamily: fonts.playfair, textAlign: 'center' },
  offerError: {
    paddingHorizontal: SPACING.md,
    fontSize: 11,
    fontFamily: fonts.dmMono,
    textAlign: 'center',
    marginTop: 8,
  },
  // mechanic
  mechanicRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  badge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontSize: 9, fontFamily: fonts.dmMono, color: '#fff', letterSpacing: 0.5 },
  mechanicPower: { fontSize: 13, fontFamily: fonts.dmMono, marginLeft: 4 },
  mechanicEffect: { fontSize: 12, fontFamily: fonts.dmSans, fontStyle: 'italic' },
  // print modal
  printForm: { padding: SPACING.md, gap: 12, paddingBottom: 40 },
  inputRow: { gap: 4 },
  inputLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: fonts.dmMono,
  },
});
