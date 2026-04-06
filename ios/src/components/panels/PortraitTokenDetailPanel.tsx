import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import { usePanel } from '../../context/PanelContext';
import { useColors, fonts, SPACING } from '../../theme';
import {
  fetchPortraitTokenDetail,
  updatePortraitToken,
  listPortraitToken,
  delistPortraitToken,
  acceptLicenseRequest,
  declineLicenseRequest,
} from '../../lib/api';

export default function PortraitTokenDetailPanel() {
  const { goBack, panelData } = usePanel();
  const c = useColors();
  const tokenId: number = panelData?.tokenId;

  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<any>(null);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [activeListing, setActiveListing] = useState<any>(null);

  const [toggling, setToggling] = useState(false);
  const [listingPrice, setListingPrice] = useState('');
  const [listingLoading, setListingLoading] = useState(false);
  const [actingRequest, setActingRequest] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPortraitTokenDetail(tokenId);
      setToken(data.token);
      setLicenses(data.licenses ?? []);
      setPendingRequests(data.pending_requests ?? []);
      setActiveListing(data.active_listing ?? null);
    } catch {
      Alert.alert('Error', 'Could not load token details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tokenId]);

  const handleToggleLicensing = async (val: boolean) => {
    setToggling(true);
    try {
      const updated = await updatePortraitToken(tokenId, { open_to_licensing: val });
      setToken(updated);
    } catch {
      Alert.alert('Error', 'Could not update token.');
    } finally {
      setToggling(false);
    }
  };

  const handleToggleHandleVisible = async (val: boolean) => {
    setToggling(true);
    try {
      const updated = await updatePortraitToken(tokenId, { handle_visible: val });
      setToken(updated);
    } catch {
      Alert.alert('Error', 'Could not update token.');
    } finally {
      setToggling(false);
    }
  };

  const handleList = async () => {
    const priceDollars = parseFloat(listingPrice);
    if (isNaN(priceDollars) || priceDollars <= 0) {
      Alert.alert('Error', 'Enter a valid price.'); return;
    }
    setListingLoading(true);
    try {
      const listing = await listPortraitToken(tokenId, Math.round(priceDollars * 100));
      setActiveListing(listing);
      setToken((prev: any) => ({ ...prev, status: 'listed' }));
      setListingPrice('');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not list token.');
    } finally {
      setListingLoading(false);
    }
  };

  const handleDelist = async () => {
    setListingLoading(true);
    try {
      await delistPortraitToken(tokenId);
      setActiveListing(null);
      setToken((prev: any) => ({ ...prev, status: 'active' }));
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not cancel listing.');
    } finally {
      setListingLoading(false);
    }
  };

  const handleAccept = async (requestId: number) => {
    setActingRequest(requestId);
    try {
      await acceptLicenseRequest(requestId);
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not accept request.');
    } finally {
      setActingRequest(null);
    }
  };

  const handleDecline = async (requestId: number) => {
    setActingRequest(requestId);
    try {
      await declineLicenseRequest(requestId);
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not decline request.');
    } finally {
      setActingRequest(null);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
            <Text style={[styles.backText, { color: c.accent }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text }]}>PORTRAIT TOKEN</Text>
          <View style={styles.backBtn} />
        </View>
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!token) {
    return (
      <View style={[styles.container, { backgroundColor: c.panelBg }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
            <Text style={[styles.backText, { color: c.accent }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.text }]}>PORTRAIT TOKEN</Text>
          <View style={styles.backBtn} />
        </View>
        <Text style={[styles.errorText, { color: c.muted }]}>Token not found.</Text>
      </View>
    );
  }

  const activeLicenses = licenses.filter(
    (l: any) => l.license && new Date(l.license.active_until) > new Date(),
  );

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>
          TOKEN #{String(token.id).padStart(4, '0')}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Portrait image */}
        {token.image_url ? (
          <Image
            source={{ uri: token.image_url }}
            style={styles.portrait}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.portrait, styles.portraitPlaceholder, { backgroundColor: c.border }]}>
            <Text style={[styles.placeholderText, { color: c.muted }]}>B&W PORTRAIT</Text>
          </View>
        )}

        {/* Token info */}
        <View style={[styles.section, { borderColor: c.border }]}>
          {token.shot_at && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: c.muted }]}>SHOT</Text>
              <Text style={[styles.infoValue, { color: c.text }]}>
                {new Date(token.shot_at).toLocaleDateString('en-CA', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </Text>
            </View>
          )}
          {token.handle_visible && token.instagram_handle && (
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: c.muted }]}>INSTAGRAM</Text>
              <Text style={[styles.infoValue, { color: c.text }]}>@{token.instagram_handle}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: c.muted }]}>STATUS</Text>
            <Text style={[styles.infoValue, { color: c.text }]}>{token.status.toUpperCase()}</Text>
          </View>
        </View>

        {/* Settings */}
        <View style={[styles.section, { borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Settings</Text>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, { color: c.text }]}>Open to licensing</Text>
              <Text style={[styles.toggleSub, { color: c.muted }]}>Allow businesses to send requests</Text>
            </View>
            <Switch
              value={token.open_to_licensing}
              onValueChange={handleToggleLicensing}
              disabled={toggling}
              trackColor={{ true: c.accent }}
            />
          </View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.toggleLabel, { color: c.text }]}>Show Instagram handle</Text>
              <Text style={[styles.toggleSub, { color: c.muted }]}>Visible to licensing businesses</Text>
            </View>
            <Switch
              value={token.handle_visible}
              onValueChange={handleToggleHandleVisible}
              disabled={toggling}
              trackColor={{ true: c.accent }}
            />
          </View>
        </View>

        {/* Incoming license requests */}
        {pendingRequests.length > 0 && (
          <View style={[styles.section, { borderColor: c.border }]}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>License Requests</Text>
            {pendingRequests.map((req: any) => {
              const businesses: Array<{ id: number; name: string; contribution_cents: number }> =
                req.requesting_businesses ?? [];
              return (
                <View key={req.id} style={[styles.requestCard, { backgroundColor: c.card, borderColor: c.border }]}>
                  <Text style={[styles.requestBiz, { color: c.accent }]}>
                    {businesses.map((b: any) => b.name).join(' + ').toUpperCase()}
                  </Text>
                  <View style={styles.requestMeta}>
                    <Text style={[styles.requestMetaText, { color: c.muted }]}>
                      {req.scope.replace('_', ' ').toUpperCase()} · {req.duration_months} mo
                    </Text>
                    <Text style={[styles.requestValue, { color: c.text }]}>
                      CA${(req.subject_cents / 100).toFixed(2)} to you
                    </Text>
                  </View>
                  {req.message ? (
                    <Text style={[styles.requestMessage, { color: c.muted }]} numberOfLines={2}>
                      "{req.message}"
                    </Text>
                  ) : null}
                  <Text style={[styles.requestExpiry, { color: c.muted }]}>
                    Expires {new Date(req.expires_at).toLocaleDateString('en-CA')}
                  </Text>
                  <View style={styles.requestBtns}>
                    <TouchableOpacity
                      style={[styles.requestBtn, { borderColor: c.border }]}
                      onPress={() => handleDecline(req.id)}
                      disabled={actingRequest === req.id}
                      activeOpacity={0.7}
                    >
                      {actingRequest === req.id ? (
                        <ActivityIndicator size="small" color={c.muted} />
                      ) : (
                        <Text style={[styles.requestBtnText, { color: c.muted }]}>Decline</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.requestBtn, { backgroundColor: c.accent }]}
                      onPress={() => handleAccept(req.id)}
                      disabled={actingRequest === req.id}
                      activeOpacity={0.7}
                    >
                      {actingRequest === req.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={[styles.requestBtnText, { color: '#fff' }]}>Accept</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Active licenses */}
        {activeLicenses.length > 0 && (
          <View style={[styles.section, { borderColor: c.border }]}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>Active Licenses</Text>
            {activeLicenses.map((l: any) => (
              <View key={l.license.id} style={[styles.licenseCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <View style={styles.licenseRow}>
                  <Text style={[styles.licenseScope, { color: c.accent }]}>
                    {l.license.scope.replace('_', ' ').toUpperCase()}
                  </Text>
                  <Text style={[styles.licenseUntil, { color: c.muted }]}>
                    until {new Date(l.license.active_until).toLocaleDateString('en-CA')}
                  </Text>
                </View>
                <Text style={[styles.licenseStats, { color: c.muted }]}>
                  {l.license.total_impressions} impressions · CA${(l.license.total_earned_cents / 100).toFixed(2)} earned
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Secondary market */}
        <View style={[styles.section, { borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>Secondary Market</Text>
          {activeListing ? (
            <View style={[styles.listingCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.listingPrice, { color: c.text }]}>
                Listed at CA${(activeListing.asking_price_cents / 100).toFixed(2)}
              </Text>
              <Text style={[styles.listingNote, { color: c.muted }]}>
                You receive 85% — royalty: CA${((activeListing.asking_price_cents * 0.15) / 100).toFixed(2)}
              </Text>
              <TouchableOpacity
                style={[styles.delistBtn, { borderColor: c.border }]}
                onPress={handleDelist}
                disabled={listingLoading}
                activeOpacity={0.7}
              >
                {listingLoading ? (
                  <ActivityIndicator size="small" color={c.muted} />
                ) : (
                  <Text style={[styles.delistBtnText, { color: c.muted }]}>Cancel listing</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            token.status !== 'listed' && (
              <View style={styles.listForm}>
                <Text style={[styles.listLabel, { color: c.muted }]}>
                  List this token for sale. Buyer earns future licensing income.
                </Text>
                <View style={styles.listInputRow}>
                  <Text style={[styles.currency, { color: c.muted }]}>CA$</Text>
                  <TextInput
                    style={[styles.listInput, { color: c.text, borderColor: c.border }]}
                    placeholder="0.00"
                    placeholderTextColor={c.muted}
                    keyboardType="decimal-pad"
                    value={listingPrice}
                    onChangeText={setListingPrice}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.listBtn, { backgroundColor: c.accent }]}
                  onPress={handleList}
                  disabled={listingLoading || !listingPrice}
                  activeOpacity={0.7}
                >
                  {listingLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.listBtnText}>List for sale</Text>
                  )}
                </TouchableOpacity>
              </View>
            )
          )}
        </View>

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
  errorText: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  portrait: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginBottom: SPACING.md,
  },
  portraitPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontFamily: fonts.dmMono,
    fontSize: 11,
    letterSpacing: 2,
  },
  section: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  sectionTitle: {
    fontFamily: fonts.playfair,
    fontSize: 18,
    marginBottom: SPACING.xs,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    fontFamily: fonts.dmMono,
    fontSize: 10,
    letterSpacing: 1,
  },
  infoValue: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  toggleLabel: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
  },
  toggleSub: {
    fontFamily: fonts.dmSans,
    fontSize: 11,
    marginTop: 2,
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: SPACING.xs },
  requestCard: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
    gap: 4,
  },
  requestBiz: {
    fontFamily: fonts.dmMono,
    fontSize: 10,
    letterSpacing: 1,
  },
  requestMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requestMetaText: {
    fontFamily: fonts.dmMono,
    fontSize: 10,
  },
  requestValue: {
    fontFamily: fonts.playfair,
    fontSize: 16,
  },
  requestMessage: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
    fontStyle: 'italic',
  },
  requestExpiry: {
    fontFamily: fonts.dmMono,
    fontSize: 10,
  },
  requestBtns: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  requestBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  requestBtnText: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
  },
  licenseCard: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
    gap: 4,
  },
  licenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  licenseScope: {
    fontFamily: fonts.dmMono,
    fontSize: 10,
    letterSpacing: 1,
  },
  licenseUntil: {
    fontFamily: fonts.dmMono,
    fontSize: 10,
  },
  licenseStats: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
  },
  listingCard: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.sm,
    gap: 4,
  },
  listingPrice: {
    fontFamily: fonts.playfair,
    fontSize: 20,
  },
  listingNote: {
    fontFamily: fonts.dmSans,
    fontSize: 12,
  },
  delistBtn: {
    marginTop: SPACING.xs,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  delistBtnText: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
  },
  listForm: { gap: SPACING.xs },
  listLabel: {
    fontFamily: fonts.dmSans,
    fontSize: 13,
    lineHeight: 20,
  },
  listInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: SPACING.xs,
  },
  currency: {
    fontFamily: fonts.dmMono,
    fontSize: 14,
  },
  listInput: {
    flex: 1,
    fontFamily: fonts.dmMono,
    fontSize: 18,
    borderBottomWidth: 1,
    paddingVertical: 4,
  },
  listBtn: {
    marginTop: SPACING.xs,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  listBtnText: {
    fontFamily: fonts.dmSans,
    fontSize: 14,
    color: '#fff',
  },
});
