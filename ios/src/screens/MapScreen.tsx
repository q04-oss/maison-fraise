import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, LayoutChangeEvent, Alert, ActivityIndicator, Animated, AppState, Linking } from 'react-native';
import MapView, { Callout, CalloutSubview, Marker, UserLocationChangeEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../context/PanelContext';
import PanelNavigator from '../components/PanelNavigator';
import OfflineBanner from '../components/OfflineBanner';
import PanelErrorBoundary from '../components/PanelErrorBoundary';
import BeaconNudge from '../components/BeaconNudge';
import { loadAndMonitorBeacons } from '../lib/beaconService';
import { initBeaconRecommendations } from '../lib/BeaconRecommendationService';
import { fetchBusinesses, fetchVarieties, updatePushToken, deleteAuthToken } from '../lib/api';
import { STRAWBERRIES } from '../data/seed';
import { useColors, fonts, SPACING } from '../theme';
import { useApp } from '../../App';
import ARBoxModule from '../lib/NativeARBoxModule';
import { haversineKm, formatDistanceKm } from '../lib/geo';

const SHEET_NAME = 'main-sheet';
const COLLAPSED_HEIGHT = 80;

const AUDITION_COLOR = '#B8860B';

function AuditionPopupPin({ live }: { live: boolean }) {
  const anim0 = useRef(new Animated.Value(0)).current;
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!live) return;
    const pulse = (anim: Animated.Value, delay: number) => {
      setTimeout(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
          ])
        ).start();
      }, delay);
    };
    pulse(anim0, 0);
    pulse(anim1, 600);
    pulse(anim2, 1200);
  }, [live]);

  const ringStyle = (anim: Animated.Value) => ({
    position: 'absolute' as const,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: AUDITION_COLOR,
    opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.45, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 3.8] }) }],
  });

  return (
    <View style={styles.pinPopup}>
      {live && <Animated.View style={ringStyle(anim0)} />}
      {live && <Animated.View style={ringStyle(anim1)} />}
      {live && <Animated.View style={ringStyle(anim2)} />}
      {/* Diamond shape: rotated square */}
      <View style={[styles.pinAuditionRing, { borderColor: AUDITION_COLOR }]} />
      <View style={[styles.pinAuditionDot, { backgroundColor: AUDITION_COLOR }]} />
    </View>
  );
}

function LivePopupPin({ color }: { color: string }) {
  const anim0 = useRef(new Animated.Value(0)).current;
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = (anim: Animated.Value, delay: number) => {
      setTimeout(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
          ])
        ).start();
      }, delay);
    };
    pulse(anim0, 0);
    pulse(anim1, 600);
    pulse(anim2, 1200);
  }, []);

  const ringStyle = (anim: Animated.Value) => ({
    position: 'absolute' as const,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: color,
    opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.45, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 3.8] }) }],
  });

  return (
    <View style={styles.pinPopup}>
      <Animated.View style={ringStyle(anim0)} />
      <Animated.View style={ringStyle(anim1)} />
      <Animated.View style={ringStyle(anim2)} />
      <View style={[styles.pinPopupRing, { borderColor: color }]} />
      <View style={[styles.pinPopupDot, { backgroundColor: color }]} />
    </View>
  );
}

function HighlightedPartnerPin({ color }: { color: string }) {
  const anim0 = useRef(new Animated.Value(0)).current;
  const anim1 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = (anim: Animated.Value, delay: number) => {
      setTimeout(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
          ])
        ).start();
      }, delay);
    };
    pulse(anim0, 0);
    pulse(anim1, 500);
  }, []);

  const ringStyle = (anim: Animated.Value) => ({
    position: 'absolute' as const,
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5,
    borderColor: color,
    opacity: anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.5, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 3] }) }],
  });

  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={ringStyle(anim0)} />
      <Animated.View style={ringStyle(anim1)} />
      <View style={[styles.pinPartner, { borderColor: color, width: 20, height: 20, borderRadius: 10 }]}>
        <View style={[styles.pinPartnerDot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const DETENTS = useMemo<[number, number, number]>(() => [COLLAPSED_HEIGHT / SCREEN_HEIGHT, 0.5, 1], [SCREEN_HEIGHT]);
  const { setBusinesses, setActiveLocation, activeLocation, setOrder, order, businesses, jumpToPanel, goHome, showPanel, sheetHeight, setSheetHeight, setPanelData, setVarieties, varieties, setUserCoords, highlightedBizId } = usePanel();
  const { pendingScreen, pendingData, clearPendingScreen, pushToken } = useApp();
  const c = useColors();
  const [contentHeight, setContentHeight] = useState(SCREEN_HEIGHT * 0.55);
  const [bizError, setBizError] = useState(false);
  const [bizLoading, setBizLoading] = useState(true);
  const mapRef = useRef<any>(null);
  const userCoords = useRef<{ latitude: number; longitude: number } | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const hasAnimatedToUser = useRef(false);


  const syncVerifiedState = useCallback(() => {
    AsyncStorage.multiGet(['verified', 'user_db_id']).then(([v, u]) => {
      if (v[1] === 'true') setIsVerified(true);
      setIsLoggedIn(!!u[1]);
    });
  }, []);

  useEffect(() => { syncVerifiedState(); }, []);

  useEffect(() => {
    if (!pushToken) return;
    updatePushToken(pushToken).catch(() => {});
  }, [pushToken]);

  const onSheetLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setContentHeight(h);
  }, []);

  const onPositionChange = useCallback((event: any) => {
    const { position } = event.nativeEvent;
    const h = SCREEN_HEIGHT - position;
    setSheetHeight(h);
    setContentHeight(h);
  }, [SCREEN_HEIGHT, setSheetHeight]);

  useEffect(() => {
    setSheetHeight(Math.round(SCREEN_HEIGHT * 0.5));
  }, []);

  useEffect(() => {
    if (pendingScreen === 'order-history') {
      clearPendingScreen();
      showPanel('order-history');
      setTimeout(() => TrueSheet.resize(SHEET_NAME, 2), 350);
    }
    if (pendingScreen === 'profile') {
      clearPendingScreen();
      showPanel('my-profile');
      setTimeout(() => TrueSheet.resize(SHEET_NAME, 2), 350);
    }
    if (pendingScreen === 'NFCVerify') {
      clearPendingScreen();
      showPanel('verifyNFC');
      setTimeout(() => TrueSheet.resize(SHEET_NAME, 2), 350);
    }
  }, [pendingScreen, businesses]);

  const loadBusinesses = () => {
    setBizError(false);
    setBizLoading(true);
    fetchBusinesses()
      .then((data: any[]) => { setBusinesses(data); })
      .catch(() => setBizError(true))
      .finally(() => setBizLoading(false));
  };

  const loadVarietiesIfNeeded = () => {
    if (varieties.length > 0) return;
    fetchVarieties()
      .then((vars: any[]) => {
        const merged = vars.map((v: any) => {
          const seed = STRAWBERRIES.find((s: any) => s.name === v.name);
          return { ...(seed ?? {}), ...v, harvestDate: v.harvest_date ?? seed?.harvestDate };
        });
        setVarieties(merged);
      })
      .catch(() => {});
  };


  useEffect(() => { loadBusinesses(); loadVarietiesIfNeeded(); loadAndMonitorBeacons(); initBeaconRecommendations(); }, []);

  useEffect(() => {
    if (!activeLocation?.lat || !activeLocation?.lng) return;
    mapRef.current?.animateToRegion({
      latitude: activeLocation.lat - 0.003,
      longitude: activeLocation.lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 400);
  }, [activeLocation?.id]);


  // Refresh businesses + portal flag when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { loadBusinesses(); syncVerifiedState(); }
    });
    return () => sub.remove();
  }, [syncVerifiedState]);

  const doMarkerNav = (biz: any) => {
    setActiveLocation(biz);
    goHome();
    setOrder({ location_id: biz.id, location_name: biz.name });
    setTimeout(() => TrueSheet.resize(SHEET_NAME, 1), 350);
    mapRef.current?.animateToRegion({
      latitude: biz.lat - 0.003,
      longitude: biz.lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 400);
  };

  const handleMarkerPress = (biz: any) => {
    doMarkerNav(biz);
  };


  const handlePartnerPress = (biz: any) => {
    showPanel('partner-detail', { partnerBusiness: biz });
    setTimeout(() => TrueSheet.resize(SHEET_NAME, 1), 350);
    mapRef.current?.animateToRegion({
      latitude: biz.lat - 0.003,
      longitude: biz.lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 400);
  };

  const handleStickerFromPin = (biz: any) => {
    const contactEmail = biz.contact && biz.contact.includes('@') && !biz.contact.startsWith('@')
      ? biz.contact.trim() : null;
    if (!contactEmail) return;
    showPanel('gift', { recipientEmail: contactEmail, businessName: biz.name, isOutreach: true });
  };

  const handleSupportFromPin = (biz: any) => {
    showPanel('donate', { businessId: biz.id, businessName: biz.name });
  };

  const handlePopupPress = (biz: any) => {
    setActiveLocation(biz);
    showPanel('home');
    setTimeout(() => TrueSheet.resize(SHEET_NAME, 1), 350);
    mapRef.current?.animateToRegion({
      latitude: biz.lat - 0.003,
      longitude: biz.lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 400);
  };


  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You\'ll need to sign in again to place orders.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive', onPress: async () => {
          await AsyncStorage.multiRemove(['user_email', 'user_db_id', 'verified', 'is_dj', 'fraise_chat_email', 'display_name', 'is_shop']);
          await deleteAuthToken();
          setOrder({ customer_email: '' });
        },
      },
    ]);
  };

  const handleLocateMe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location access needed', 'Enable location in Settings to use this feature.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const nextCoords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    userCoords.current = nextCoords;
    setUserLocation(nextCoords);
    setUserCoords(nextCoords);
    mapRef.current?.animateToRegion({
      ...nextCoords,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 400);
  };

  const handleShowAll = () => {
    if (validBusinesses.length === 0) return;
    if (validBusinesses.length === 1) {
      mapRef.current?.animateToRegion({
        latitude: validBusinesses[0].lat - 0.003,
        longitude: validBusinesses[0].lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 400);
      return;
    }
    mapRef.current?.fitToCoordinates(
      validBusinesses.map(b => ({ latitude: b.lat, longitude: b.lng })),
      {
        edgePadding: {
          top: insets.top + 60,
          right: 60,
          bottom: SCREEN_HEIGHT * 0.5 + 60,
          left: 60,
        },
        animated: true,
      }
    );
  };

  const handleDirections = async (biz: any) => {
    const appleUrl = `maps://maps.apple.com/?daddr=${biz.lat},${biz.lng}&dirflg=d`;
    const fallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${biz.lat},${biz.lng}`;
    try {
      const supported = await Linking.canOpenURL(appleUrl);
      await Linking.openURL(supported ? appleUrl : fallbackUrl);
    } catch {
      try {
        await Linking.openURL(fallbackUrl);
      } catch {
        Alert.alert('Could not open maps', 'No maps app found on this device.');
      }
    }
  };

  const handleStrawberryPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const coords = userCoords.current;
    const candidates = validBusinesses.filter(b => b.lat !== 0 && b.lng !== 0 && (b.type === 'collection' || b.type === 'popup'));

    if (!coords || candidates.length === 0) {
      // No user location or no valid businesses — fall back to showing all
      handleShowAll();
      return;
    }

    const nearest = candidates.reduce((best, b) => {
      const d = haversineKm(coords.latitude, coords.longitude, b.lat, b.lng);
      return d < best.dist ? { biz: b, dist: d } : best;
    }, { biz: candidates[0], dist: Infinity }).biz;

    doMarkerNav(nearest);
  };

  const isLive = (b: any): boolean => {
    if (!b.launched_at) return false;
    const start = new Date(b.launched_at);
    const end = b.ends_at
      ? new Date(b.ends_at)
      : new Date(start.getTime() + 4 * 60 * 60 * 1000);
    const now = new Date();
    return now >= start && now < end;
  };

  const now = new Date();
  const validBusinesses = businesses.filter(b => b.lat && b.lng);
  const collectionPoints = validBusinesses.filter(b => b.type === 'collection');
  const allPopups = validBusinesses.filter(b => {
    if (b.type !== 'popup') return false;
    if (!b.launched_at) return false;
    const d = new Date(b.launched_at);
    d.setHours(23, 59, 59, 999);
    return d >= now;
  });
  const popups = allPopups.filter(b => !b.is_audition);
  const auditionPopups = allPopups.filter(b => b.is_audition);
  const partners = validBusinesses.filter(b => b.type !== 'collection' && b.type !== 'popup');

  const formatDistance = (lat: number, lng: number): string | null => {
    if (!userLocation) return null;
    return formatDistanceKm(haversineKm(userLocation.latitude, userLocation.longitude, lat, lng));
  };

  const fabBottom = sheetHeight + 16;
  const fabsVisible = sheetHeight < SCREEN_HEIGHT - insets.top - 40;

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <BeaconNudge />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: 45.4734,
          longitude: -73.5773,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        mapType="mutedStandard"
        userInterfaceStyle="light"
        showsUserLocation
        showsCompass={false}
        showsScale={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onUserLocationChange={(e: UserLocationChangeEvent) => {
          const coord = e.nativeEvent.coordinate;
          if (!coord) return;
          const next = { latitude: coord.latitude, longitude: coord.longitude };
          const prev = userCoords.current;
          // Only propagate to React state if moved more than ~10 m to avoid GPS jitter re-renders
          if (prev && haversineKm(prev.latitude, prev.longitude, next.latitude, next.longitude) < 0.01) return;
          userCoords.current = next;
          setUserLocation(next);
          setUserCoords(next);
          if (!hasAnimatedToUser.current) {
            hasAnimatedToUser.current = true;
            mapRef.current?.animateToRegion({
              latitude: next.latitude - 0.01,
              longitude: next.longitude,
              latitudeDelta: 0.04,
              longitudeDelta: 0.04,
            }, 600);
          }
        }}
      >
        {collectionPoints.map(b => (
          <Marker
            key={`col-${b.id}`}
            coordinate={{ latitude: b.lat, longitude: b.lng }}
            onPress={() => handleMarkerPress(b)}
          >
            <View style={[styles.pinCollection, { backgroundColor: c.markerBg }]}>
              <View style={styles.pinCollectionDot} />
            </View>
            <Callout tooltip>
              <View style={[styles.callout, { backgroundColor: c.card }]}>
                <Text style={[styles.calloutName, { color: c.text }]}>{b.name}</Text>
                {!!b.address && (
                  <Text style={[styles.calloutAddress, { color: c.muted }]}>{b.address}</Text>
                )}
                {!!b.hours && (
                  <Text style={[styles.calloutHours, { color: c.muted }]}>{b.hours}</Text>
                )}
                {!!formatDistance(b.lat, b.lng) && (
                  <Text style={[styles.calloutDistance, { color: c.muted }]}>{formatDistance(b.lat, b.lng)}</Text>
                )}
                <CalloutSubview onPress={() => handleDirections(b)}>
                  <Text style={[styles.calloutDirections, { color: c.accent ?? '#c94f6d' }]}>get directions →</Text>
                </CalloutSubview>
              </View>
            </Callout>
          </Marker>
        ))}

        {popups.map(b => {
          const live = isLive(b);
          return (
            <Marker
              key={`popup-${b.id}`}
              coordinate={{ latitude: b.lat, longitude: b.lng }}
              tracksViewChanges={live}
              onPress={() => handlePopupPress(b)}
            >
              {live
                ? <LivePopupPin color="#C0392B" />
                : (
                  <View style={styles.pinPopup}>
                    <View style={[styles.pinPopupRing, { borderColor: '#C0392B' }]} />
                    <View style={[styles.pinPopupDot, { backgroundColor: '#C0392B' }]} />
                  </View>
                )
              }
            </Marker>
          );
        })}

        {auditionPopups.map(b => {
          const live = isLive(b);
          return (
            <Marker
              key={`audition-${b.id}`}
              coordinate={{ latitude: b.lat, longitude: b.lng }}
              tracksViewChanges={live}
            >
              <AuditionPopupPin live={live} />
            </Marker>
          );
        })}

        {partners.map(b => {
          const isHighlighted = highlightedBizId === b.id;
          return (
          <Marker
            key={`biz-${b.id}`}
            coordinate={{ latitude: b.lat, longitude: b.lng }}
            tracksViewChanges={isHighlighted}
            onPress={() => {
              showPanel('partner-detail', { partnerBusiness: b });
              TrueSheet.resize(SHEET_NAME, 1);
            }}
          >
            {isHighlighted
              ? <HighlightedPartnerPin color={c.markerBg} />
              : (
                <View style={[styles.pinPartner, { borderColor: c.markerBg }]}>
                  <View style={[styles.pinPartnerDot, { backgroundColor: c.markerBg }]} />
                  {b.placed_user_name && (
                    <View style={styles.pinPlacedDot} />
                  )}
                </View>
              )
            }
            <Callout tooltip onPress={() => handlePartnerPress(b)}>
              <View style={[styles.callout, { backgroundColor: c.card }]}>
                <Text style={[styles.calloutName, { color: c.text }]}>{b.name}</Text>
                {!!b.address && (
                  <Text style={[styles.calloutAddress, { color: c.muted }]}>{b.address}</Text>
                )}
                {!!b.hours && (
                  <Text style={[styles.calloutHours, { color: c.muted }]}>{b.hours}</Text>
                )}
                {!!formatDistance(b.lat, b.lng) && (
                  <Text style={[styles.calloutDistance, { color: c.muted }]}>{formatDistance(b.lat, b.lng)}</Text>
                )}
                <CalloutSubview onPress={() => handleDirections(b)}>
                  <Text style={[styles.calloutDirections, { color: c.accent }]}>get directions →</Text>
                </CalloutSubview>
              </View>
            </Callout>
          </Marker>
          );
        })}

      </MapView>

      <TrueSheet
        name={SHEET_NAME}
        detents={DETENTS}
        initialDetentIndex={1}
        cornerRadius={20}
        style={{ backgroundColor: c.sheetBg }}
        dismissible={false}
        dimmed={false}
        grabber
        grabberOptions={{ color: 'rgba(0,0,0,0.2)' }}
        onPositionChange={onPositionChange}
        onDidPresent={(e: any) => {
          const idx = e.nativeEvent.index;
          const h = [COLLAPSED_HEIGHT, Math.round(SCREEN_HEIGHT * 0.5), SCREEN_HEIGHT][idx] ?? COLLAPSED_HEIGHT;
          setSheetHeight(h);
          setContentHeight(h);
        }}
        scrollable
      >
        <View style={{ height: contentHeight, backgroundColor: c.sheetBg }} onLayout={onSheetLayout}>
          <PanelErrorBoundary onReset={() => goHome()}>
            <PanelNavigator />
          </PanelErrorBoundary>
        </View>
      </TrueSheet>

      {bizLoading && businesses.length === 0 && (
        <ActivityIndicator
          color="#A0522D"
          style={[styles.bizLoadingIndicator, { top: insets.top + 60 }]}
        />
      )}

      {bizError && (
        <TouchableOpacity
          style={[styles.bizErrorBanner, { backgroundColor: c.card }]}
          onPress={loadBusinesses}
          activeOpacity={0.8}
        >
          <Text style={[styles.bizErrorText, { color: c.muted }]}>Could not load locations. Tap to retry.</Text>
        </TouchableOpacity>
      )}

{fabsVisible && (
        <View style={[styles.fabPill, { bottom: fabBottom, backgroundColor: c.card }]} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.fabPillBtn}
            onPress={handleStrawberryPress}
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              jumpToPanel('merch');
              setTimeout(() => TrueSheet.resize(SHEET_NAME, 2), 350);
            }}
            delayLongPress={400}
            activeOpacity={0.7}
          >
            <Text style={styles.fabIcon}>🍓</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.fabPillBtn}
            onPress={() => { setActiveLocation(null); goHome(); setTimeout(() => TrueSheet.resize(SHEET_NAME, 1), 350); }}
            onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleLocateMe(); }}
            delayLongPress={500}
            activeOpacity={0.7}
          >
            <Text style={styles.fabIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fabPill: {
    position: 'absolute',
    right: 16,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    zIndex: 10,
  },
  fabPillBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: { fontSize: 22 },
  arDemoBtn: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  arDemoBtnText: { fontSize: 13, letterSpacing: 2 },
  pinCollection: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pinCollectionDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  pinPopup: {
    width: 32, height: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  pinPopupRing: {
    position: 'absolute',
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 2,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pinPopupDot: { width: 10, height: 10, borderRadius: 5 },
  pinAuditionRing: {
    position: 'absolute',
    width: 26, height: 26,
    borderRadius: 4,
    borderWidth: 2,
    transform: [{ rotate: '45deg' }],
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pinAuditionDot: { width: 8, height: 8, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  pinPartner: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#fff', borderWidth: 2,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  pinPartnerDot: { width: 6, height: 6, borderRadius: 3 },
  pinPlacedDot: {
    position: 'absolute', top: -3, right: -3,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#C9973A',
    borderWidth: 1.5, borderColor: '#fff',
  },
  bizLoadingIndicator: { position: 'absolute', alignSelf: 'center' },
  bizErrorBanner: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bizErrorText: { fontSize: 13, fontFamily: 'DMSans_400Regular' },
  callout: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 180,
    maxWidth: 280,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
    gap: 3,
  },
  calloutName: { fontSize: 12, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  calloutAddress: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3 },
  calloutHours: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3, marginTop: 2 },
  calloutDistance: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.3, marginTop: 2 },
  calloutDirections: { fontSize: 10, fontFamily: fonts.dmMono, letterSpacing: 0.5, marginTop: 6, paddingBottom: 2 },
});
