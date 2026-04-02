import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Switch,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useApp } from '../../../App';
import { usePanel } from '../../context/PanelContext';
import {
  signInWithApple, fetchStandingOrders, updateStandingOrder,
  cancelStandingOrder, fetchOrdersByEmail,
  fetchUserPopupRsvps, fetchDjGigs, fetchDjAllocations, registerAsDj,
  fetchHostedPopups, fetchActiveContract, fetchFollowerCount, logMemberVisit,
  fetchLegitimacyBreakdown,
} from '../../lib/api';
import { CHOCOLATES, FINISHES } from '../../data/seed';
import { useColors, fonts } from '../../theme';
import { SPACING } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

export default function ProfilePanel() {
  const { goHome, jumpToPanel, showPanel, setOrder, setActiveLocation, varieties, businesses } = usePanel();
  const { pushToken } = useApp();
  const c = useColors();
  const { isDark } = useTheme();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userDbId, setUserDbId] = useState<number | null>(null);
  const [isVerified, setIsVerifiedState] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [standingOrders, setStandingOrders] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [isDj, setIsDj] = useState(false);
  const [djToggling, setDjToggling] = useState(false);
  const [upcomingPopups, setUpcomingPopups] = useState<any[]>([]);
  const [hostedPopups, setHostedPopups] = useState<any[]>([]);
  const [djGigs, setDjGigs] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [activeContract, setActiveContract] = useState<any>(null);
  const [followerCount, setFollowerCount] = useState<number>(0);
  const [loggingVisit, setLoggingVisit] = useState(false);
  const [legitimacy, setLegitimacy] = useState<{ total: number; breakdown: { event_type: string; total: number; count: number }[] } | null>(null);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('user_email'),
      AsyncStorage.getItem('verified'),
      AsyncStorage.getItem('user_db_id'),
      AsyncStorage.getItem('is_dj'),
      AppleAuthentication.isAvailableAsync().catch(() => false),
    ]).then(([email, verified, dbId, djFlag, available]) => {
      const verifiedBool = verified === 'true';
      setIsVerifiedState(verifiedBool);
      setAppleAvailable(available as boolean);
      setIsDj(djFlag === 'true');
      if (email) {
        setUserEmail(email);
        fetchOrdersByEmail(email)
          .then((orders: any[]) => {
            const paid = orders
              .filter((o: any) => o.status === 'paid' || o.status === 'confirmed')
              .sort((a: any, b: any) => (b.id ?? 0) - (a.id ?? 0));
            setRecentOrders(paid.slice(0, 3));
          })
          .catch(() => {});
      }
      if (dbId) {
        const uid = parseInt(dbId, 10);
        setUserDbId(uid);
        fetchStandingOrders(uid).then(setStandingOrders).catch(() => {});
        fetchActiveContract(uid).then(setActiveContract).catch(() => {});
        fetchFollowerCount(uid).then(r => setFollowerCount(r.follower_count)).catch(() => {});
        fetchLegitimacyBreakdown(uid).then(setLegitimacy).catch(() => {});
        if (verifiedBool) {
          fetchUserPopupRsvps(uid).then(setUpcomingPopups).catch(() => {});
          fetchHostedPopups(uid).then(setHostedPopups).catch(() => {});
          if (djFlag === 'true') {
            fetchDjGigs(uid).then(setDjGigs).catch(() => {});
            fetchDjAllocations(uid).then(setAllocations).catch(() => {});
          }
        }
      }
    }).finally(() => setLoading(false));
  }, []);

  const handleAppleSignIn = async () => {
    setSigningIn(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token received.');
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean).join(' ') || null;
      const result = await signInWithApple(credential.identityToken, pushToken, fullName);
      await AsyncStorage.setItem('user_db_id', String(result.user_db_id));
      await AsyncStorage.setItem('user_email', result.email);
      setUserEmail(result.email);
      setUserDbId(result.user_db_id);
      fetchStandingOrders(result.user_db_id).then(setStandingOrders).catch(() => {});
      fetchOrdersByEmail(result.email)
        .then((orders: any[]) => {
          const paid = orders
            .filter((o: any) => o.status === 'paid' || o.status === 'confirmed')
            .sort((a: any, b: any) => (b.id ?? 0) - (a.id ?? 0));
          setRecentOrders(paid.slice(0, 3));
        })
        .catch(() => {});
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign in failed', err.message ?? 'Please try again.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleDjToggle = async () => {
    if (!userDbId || djToggling) return;
    const next = !isDj;
    setDjToggling(true);
    try {
      await registerAsDj(userDbId, next);
      setIsDj(next);
      await AsyncStorage.setItem('is_dj', next ? 'true' : 'false');
      if (next) {
        fetchDjGigs(userDbId).then(setDjGigs).catch(() => {});
        fetchDjAllocations(userDbId).then(setAllocations).catch(() => {});
      } else {
        setDjGigs([]);
        setAllocations([]);
      }
    } catch {
      Alert.alert('Could not update', 'Try again.');
    } finally {
      setDjToggling(false);
    }
  };

  const handleLogVisit = async () => {
    if (!activeContract || !userDbId || loggingVisit) return;
    setLoggingVisit(true);
    try {
      await logMemberVisit(activeContract.business_id, userDbId);
      Alert.alert('Visit logged', 'Member visit recorded successfully.');
    } catch (err: any) {
      Alert.alert('Could not log', err.message ?? 'Please try again.');
    } finally {
      setLoggingVisit(false);
    }
  };

  const handleCancelStanding = (id: number) => {
    Alert.alert('Cancel standing order?', 'This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel order', style: 'destructive',
        onPress: async () => {
          try {
            await cancelStandingOrder(id);
            setStandingOrders(prev => prev.filter(o => o.id !== id));
          } catch {
            Alert.alert('Could not cancel', 'Try again.');
          }
        },
      },
    ]);
  };

  const handleToggleStanding = async (id: number, current: string) => {
    const next = current === 'active' ? 'paused' : 'active';
    try {
      await updateStandingOrder(id, next);
      setStandingOrders(prev => prev.map(o => o.id === id ? { ...o, status: next } : o));
    } catch {
      Alert.alert('Could not update', 'Try again.');
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You\'ll need to sign in again to place orders.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await AsyncStorage.multiRemove(['user_email', 'user_db_id', 'verified', 'is_dj']);
          setUserEmail(null);
          setUserDbId(null);
          setIsVerifiedState(false);
          setIsDj(false);
          setStandingOrders([]);
          setRecentOrders([]);
          setUpcomingPopups([]);
          setHostedPopups([]);
          setDjGigs([]);
          setAllocations([]);
          setActiveContract(null);
          setFollowerCount(0);
          setOrder({ customer_email: '' });
        },
      },
    ]);
  };

  const lastOrder = recentOrders[0] ?? null;

  const handleOrderAgain = () => {
    if (!lastOrder) return;
    const variety = varieties.find(v => v.id === lastOrder.variety_id);
    if (!variety) {
      Alert.alert('Not available', 'That variety isn\'t available today. Browse what\'s in season instead.');
      return;
    }
    const business = businesses.find(b => b.id === lastOrder.location_id);
    const chocName = CHOCOLATES.find(choc => choc.id === lastOrder.chocolate)?.name ?? lastOrder.chocolate ?? null;
    const finName = FINISHES.find(f => f.id === lastOrder.finish)?.name ?? lastOrder.finish ?? null;
    if (business) setActiveLocation(business);
    setOrder({
      variety_id: lastOrder.variety_id,
      variety_name: variety?.name ?? lastOrder.variety_name ?? null,
      price_cents: variety?.price_cents ?? null,
      chocolate: lastOrder.chocolate ?? null,
      chocolate_name: chocName,
      finish: lastOrder.finish ?? null,
      finish_name: finName,
      quantity: lastOrder.quantity ?? 4,
      location_id: lastOrder.location_id ?? null,
      location_name: business?.name ?? lastOrder.location_name ?? null,
    });
    const nextPanel = !lastOrder.chocolate ? 'chocolate' : !lastOrder.finish ? 'finish' : 'when';
    jumpToPanel(nextPanel);
  };

  const upcomingDjGigs = djGigs.filter((g: any) => g.status === 'upcoming');
  const pastDjGigs = djGigs.filter((g: any) => g.status === 'past');

  // Poll RSVP counts while DJ has upcoming gigs
  useEffect(() => {
    if (!isDj || !userDbId || upcomingDjGigs.length === 0) return;
    const interval = setInterval(() => {
      fetchDjGigs(userDbId).then(setDjGigs).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [isDj, userDbId, upcomingDjGigs.length]);

  return (
    <View style={[styles.container, { backgroundColor: c.panelBg }]}>
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={goHome} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: c.accent }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {userEmail ? (
            <>
              <Text style={[styles.headerEmail, { color: c.text }]}>{userEmail}</Text>
              {isVerified && <Text style={[styles.headerVerified, { color: c.accent }]}>Verified member</Text>}
            </>
          ) : !loading && appleAvailable ? (
            signingIn ? <ActivityIndicator color={c.accent} /> : (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14}
                style={styles.appleBtn}
                onPress={handleAppleSignIn}
              />
            )
          ) : null}
        </View>
        {userEmail ? (
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn} activeOpacity={0.7}>
            <Text style={[styles.signOutText, { color: c.muted }]}>Sign out</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Quick access */}
            {userDbId && (
              <View style={[styles.verifiedActions, { borderColor: c.border }]}>
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => showPanel('order-history')}
                  activeOpacity={0.75}
                >
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionTitle, { color: c.text }]}>Order History</Text>
                    <Text style={[styles.actionSub, { color: c.muted }]}>View all your past orders</Text>
                  </View>
                  <Text style={[styles.chevron, { color: c.muted }]}>›</Text>
                </TouchableOpacity>

                <View style={[styles.actionRowDivider, { backgroundColor: c.border }]} />

                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => showPanel('activity-feed')}
                  activeOpacity={0.75}
                >
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionTitle, { color: c.text }]}>Activity</Text>
                    <Text style={[styles.actionSub, { color: c.muted }]}>See what people you follow are up to</Text>
                  </View>
                  <Text style={[styles.chevron, { color: c.muted }]}>›</Text>
                </TouchableOpacity>

                <View style={[styles.actionRowDivider, { backgroundColor: c.border }]} />

                <TouchableOpacity
                  style={[styles.actionRow, styles.actionRowLast]}
                  onPress={() => showPanel('notification-inbox')}
                  activeOpacity={0.75}
                >
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionTitle, { color: c.text }]}>Notifications</Text>
                    <Text style={[styles.actionSub, { color: c.muted }]}>Your inbox from Maison Fraise</Text>
                  </View>
                  <Text style={[styles.chevron, { color: c.muted }]}>›</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Active contract / placement */}
            {activeContract && (
              <View style={[styles.contractCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>CURRENT PLACEMENT</Text>
                <Text style={[styles.contractBiz, { color: c.text }]}>{activeContract.business_name}</Text>
                <Text style={[styles.contractMeta, { color: c.muted }]}>{activeContract.business_address}</Text>
                <View style={[styles.contractDivider, { backgroundColor: c.border }]} />
                <TouchableOpacity
                  style={[styles.logVisitBtn, { backgroundColor: c.accent }, loggingVisit && { opacity: 0.6 }]}
                  onPress={handleLogVisit}
                  activeOpacity={0.8}
                  disabled={loggingVisit}
                >
                  <Text style={styles.logVisitText}>+ Log member visit</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Follower count */}
            {userDbId && followerCount > 0 && (
              <View style={[styles.followerRow, { borderColor: c.border }]}>
                <Text style={[styles.followerCount, { color: c.text }]}>{followerCount}</Text>
                <Text style={[styles.followerLabel, { color: c.muted }]}>
                  {followerCount === 1 ? 'follower' : 'followers'}
                </Text>
              </View>
            )}

            {/* Legitimacy score */}
            {legitimacy && legitimacy.total > 0 && (
              <View style={[styles.legitimacyCard, { borderColor: c.border }]}>
                <View style={styles.legitimacyHeader}>
                  <Text style={[styles.sectionLabel, { color: c.muted }]}>RELEVANCE SCORE</Text>
                  <Text style={[styles.legitimacyTotal, { color: c.text }]}>{legitimacy.total}</Text>
                </View>
                {legitimacy.breakdown.map(e => (
                  <View key={e.event_type} style={[styles.legitimacyRow, { borderTopColor: c.border }]}>
                    <Text style={[styles.legitimacyType, { color: c.muted }]}>
                      {e.event_type.replace(/_/g, ' ')}
                    </Text>
                    <Text style={[styles.legitimacyScore, { color: c.text }]}>+{e.total}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Order again */}
            {lastOrder && (
              <TouchableOpacity
                style={[styles.orderAgainRow, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={handleOrderAgain}
                activeOpacity={0.8}
              >
                <View style={styles.orderAgainInfo}>
                  <Text style={[styles.sectionLabel, { color: c.muted }]}>ORDER AGAIN</Text>
                  <Text style={[styles.orderAgainName, { color: c.text }]}>{lastOrder.variety_name ?? '—'}</Text>
                  <Text style={[styles.orderAgainSub, { color: c.muted }]}>
                    {CHOCOLATES.find(choc => choc.id === lastOrder.chocolate)?.name ?? lastOrder.chocolate ?? '—'}
                    {' · '}
                    {FINISHES.find(f => f.id === lastOrder.finish)?.name ?? lastOrder.finish ?? '—'}
                    {' · '}{lastOrder.quantity}
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: c.accent }]}>→</Text>
              </TouchableOpacity>
            )}

            {/* Recent orders */}
            {recentOrders.length > 1 && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>RECENT ORDERS</Text>
                {recentOrders.slice(1).map((o: any) => (
                  <View key={o.id} style={[styles.row, { borderBottomColor: c.border }]}>
                    <Text style={[styles.rowName, { color: c.text }]}>{o.variety_name ?? '—'}</Text>
                    <Text style={[styles.rowMeta, { color: c.muted }]}>#{o.id}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Upcoming popup RSVPs */}
            {isVerified && upcomingPopups.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>UPCOMING POPUPS</Text>
                {upcomingPopups.map((p: any) => (
                  <View key={p.id} style={[styles.popupRsvpRow, { backgroundColor: c.card, borderColor: c.border }]}>
                    <View style={styles.popupRsvpInfo}>
                      <Text style={[styles.popupRsvpVenue, { color: c.text }]}>{p.venue_name}</Text>
                      <Text style={[styles.popupRsvpMeta, { color: c.muted }]}>
                        {p.date} · {p.time}{p.dj_name ? ` · ${p.dj_name}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.popupRsvpCount, { color: c.muted }]}>{p.rsvp_count} going</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Hosted popups / audition status */}
            {isVerified && hostedPopups.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>MY POPUPS</Text>
                {hostedPopups.map((p: any) => {
                  const statusColor = p.audition_status === 'passed'
                    ? c.accent
                    : p.audition_status === 'failed'
                      ? '#C0392B'
                      : c.muted;
                  const statusLabel = p.audition_status === 'passed'
                    ? 'Threshold reached'
                    : p.audition_status === 'failed'
                      ? 'Did not pass'
                      : p.is_audition
                        ? `${p.nomination_count} nomination${p.nomination_count !== 1 ? 's' : ''}`
                        : null;
                  return (
                    <View key={p.id} style={[styles.hostedRow, { backgroundColor: c.card, borderColor: c.border }]}>
                      <View style={styles.hostedInfo}>
                        {p.is_audition && (
                          <Text style={[styles.hostedBadge, { color: '#B8860B' }]}>AUDITION</Text>
                        )}
                        <Text style={[styles.rowName, { color: c.text }]}>{p.venue_name}</Text>
                        <Text style={[styles.rowMeta, { color: c.muted }]}>{p.date}</Text>
                      </View>
                      {statusLabel && (
                        <Text style={[styles.rowMeta, { color: statusColor }]}>{statusLabel}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Verified actions */}
            {isVerified && (
              <View style={[styles.verifiedActions, { borderColor: c.border }]}>
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => showPanel('contract-offer')}
                  activeOpacity={0.75}
                >
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionTitle, { color: c.text }]}>Placement offer</Text>
                    <Text style={[styles.actionSub, { color: c.muted }]}>Review your contract from Maison Fraise</Text>
                  </View>
                  <Text style={[styles.chevron, { color: c.muted }]}>›</Text>
                </TouchableOpacity>

                <View style={[styles.actionRowDivider, { backgroundColor: c.border }]} />

                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => showPanel('popup-request')}
                  activeOpacity={0.75}
                >
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionTitle, { color: c.text }]}>Host a popup</Text>
                    <Text style={[styles.actionSub, { color: c.muted }]}>Propose a date, venue, and vibe</Text>
                  </View>
                  <Text style={[styles.chevron, { color: c.muted }]}>›</Text>
                </TouchableOpacity>

                <View style={[styles.actionRowDivider, { backgroundColor: c.border }]} />

                <View style={[styles.actionRow, styles.actionRowLast]}>
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionTitle, { color: c.text }]}>I'm a DJ</Text>
                    <Text style={[styles.actionSub, { color: c.muted }]}>Receive popup gig requests</Text>
                  </View>
                  <Switch
                    value={isDj}
                    onValueChange={handleDjToggle}
                    disabled={djToggling}
                    trackColor={{ false: c.border, true: c.accent }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
            )}

            {/* Standing orders */}
            {standingOrders.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>STANDING ORDERS</Text>
                {standingOrders.map((so: any) => (
                  <View key={so.id} style={[styles.standingRow, { backgroundColor: c.card, borderColor: c.border }]}>
                    <View style={styles.standingInfo}>
                      <Text style={[styles.rowName, { color: c.text }]}>{so.variety_name ?? '—'}</Text>
                      <Text style={[styles.rowMeta, { color: c.muted }]}>{so.frequency} · {so.status}</Text>
                    </View>
                    <View style={styles.standingActions}>
                      <TouchableOpacity onPress={() => handleToggleStanding(so.id, so.status)} activeOpacity={0.7}>
                        <Text style={[styles.standingActionText, { color: c.accent }]}>
                          {so.status === 'active' ? 'Pause' : 'Resume'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleCancelStanding(so.id)} activeOpacity={0.7}>
                        <Text style={[styles.standingActionText, { color: c.muted }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* DJ gigs */}
            {isDj && upcomingDjGigs.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>UPCOMING GIGS</Text>
                {upcomingDjGigs.map((g: any) => {
                  const isToday = g.date === new Date().toISOString().split('T')[0];
                  return (
                    <View key={g.id} style={[styles.row, { borderBottomColor: c.border }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.rowName, { color: c.text }]}>{g.venue_name}</Text>
                        <Text style={[styles.rowMeta, { color: c.muted }]}>{g.date} · {g.time}</Text>
                      </View>
                      <View style={styles.gigRight}>
                        {isToday && <View style={[styles.liveDot, { backgroundColor: '#C0392B' }]} />}
                        <Text style={[styles.rowMeta, { color: isToday ? c.text : c.muted }]}>{g.rsvp_count} going</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {isDj && pastDjGigs.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>PAST GIGS</Text>
                {pastDjGigs.map((g: any) => (
                  <View key={g.id} style={[styles.row, { borderBottomColor: c.border }]}>
                    <Text style={[styles.rowName, { color: c.text }]}>{g.venue_name}</Text>
                    <Text style={[styles.rowMeta, { color: c.muted }]}>{g.date}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Allocations */}
            {allocations.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>ALLOCATIONS</Text>
                {allocations.map((a: any) => (
                  <View key={a.id} style={[styles.row, { borderBottomColor: c.border }]}>
                    <Text style={[styles.rowName, { color: c.text }]}>Complimentary box</Text>
                    <Text style={[styles.rowMeta, { color: a.claimed ? c.muted : c.accent }]}>
                      {a.claimed ? 'Claimed' : a.description}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Verification hint for unverified */}
            {!isVerified && (
              <View style={styles.verifyHint}>
                <Text style={[styles.sectionLabel, { color: c.muted }]}>VERIFICATION</Text>
                <Text style={[styles.verifyHintText, { color: c.muted }]}>
                  Sign in with Apple, collect your first order in person, then tap your phone to the NFC chip inside the box lid. Unlocks popups, standing orders, and early access.
                </Text>
              </View>
            )}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
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
    gap: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingVertical: 4, flexShrink: 0 },
  backBtnText: { fontSize: 28, lineHeight: 34 },
  headerCenter: { flex: 1, paddingHorizontal: SPACING.sm, gap: 2 },
  headerEmail: { fontSize: 15, fontFamily: fonts.playfair },
  headerVerified: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1 },
  headerSpacer: { width: 40 },
  signOutBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  signOutText: { fontSize: 13, fontFamily: fonts.dmSans },
  appleBtn: { height: 44 },
  body: { padding: SPACING.md, gap: 12 },

  sectionLabel: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 1.5, marginBottom: 6 },
  section: { gap: 0 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowName: { fontSize: 14, fontFamily: fonts.playfair },
  rowMeta: { fontSize: 12, fontFamily: fonts.dmMono },
  chevron: { fontSize: 20 },

  orderAgainRow: {
    borderRadius: 14,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  orderAgainInfo: { flex: 1, gap: 3 },
  orderAgainName: { fontSize: 15, fontFamily: fonts.playfair },
  orderAgainSub: { fontSize: 12, fontFamily: fonts.dmSans },

  popupRsvpRow: {
    borderRadius: 12,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  popupRsvpInfo: { flex: 1, gap: 3 },
  popupRsvpVenue: { fontSize: 14, fontFamily: fonts.playfair },
  popupRsvpMeta: { fontSize: 11, fontFamily: fonts.dmMono },
  popupRsvpCount: { fontSize: 11, fontFamily: fonts.dmMono },

  verifiedActions: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    gap: 12,
  },
  actionRowLast: { paddingVertical: 10 },
  actionRowDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: SPACING.md },
  actionInfo: { flex: 1, gap: 2 },
  actionTitle: { fontSize: 15, fontFamily: fonts.playfair },
  actionSub: { fontSize: 12, fontFamily: fonts.dmSans },

  standingRow: {
    borderRadius: 14,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  standingInfo: { flex: 1, gap: 3 },
  standingActions: { flexDirection: 'row', gap: 16 },
  standingActionText: { fontSize: 13, fontFamily: fonts.dmSans },

  hostedRow: {
    borderRadius: 12,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
    gap: 12,
  },
  hostedInfo: { flex: 1, gap: 2 },
  hostedBadge: { fontSize: 9, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  gigRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  verifyHint: { gap: 5 },
  verifyHintText: { fontSize: 13, fontFamily: fonts.dmSans, lineHeight: 20, fontStyle: 'italic' },

  contractCard: {
    borderRadius: 14,
    padding: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  contractBiz: { fontSize: 17, fontFamily: fonts.playfair, marginTop: 4 },
  contractMeta: { fontSize: 12, fontFamily: fonts.dmSans },
  contractDivider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  logVisitBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logVisitText: { fontSize: 14, fontFamily: fonts.dmSans, color: '#fff' },

  followerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  followerCount: { fontSize: 22, fontFamily: fonts.playfair },
  followerLabel: { fontSize: 12, fontFamily: fonts.dmMono },

  legitimacyCard: {
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
  legitimacyHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
  },
  legitimacyTotal: { fontSize: 22, fontFamily: fonts.playfair },
  legitimacyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legitimacyType: { fontSize: 12, fontFamily: fonts.dmSans, textTransform: 'capitalize' },
  legitimacyScore: { fontSize: 14, fontFamily: fonts.dmMono },
});
