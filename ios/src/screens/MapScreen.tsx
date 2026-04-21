import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, LayoutChangeEvent, Alert, ActivityIndicator, Animated, AppState, Linking } from 'react-native';
import MapView, { Marker, UserLocationChangeEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../context/PanelContext';
import PanelNavigator, { detentIndexForPanel } from '../components/PanelNavigator';
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
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: AUDITION_COLOR,
    opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.45, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 3.8] }) }],
  });

  return (
    <View style={styles.pinCircleWrap}>
      {live && <Animated.View style={ringStyle(anim0)} />}
      {live && <Animated.View style={ringStyle(anim1)} />}
      {live && <Animated.View style={ringStyle(anim2)} />}
      <View style={[styles.pinCircle, { backgroundColor: AUDITION_COLOR }]} />
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
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: color,
    opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.45, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 3.8] }) }],
  });

  return (
    <View style={styles.pinCircleWrap}>
      <Animated.View style={ringStyle(anim0)} />
      <Animated.View style={ringStyle(anim1)} />
      <Animated.View style={ringStyle(anim2)} />
      <View style={[styles.pinCircle, { backgroundColor: color }]} />
    </View>
  );
}


export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const TAB_HEIGHT = 44;
  const TAB_BOTTOM = insets.bottom + 8;
  // Bar extends from screen bottom; full detent must stop at bar top edge
  const TAB_BAR_TOTAL = TAB_HEIGHT + TAB_BOTTOM;
  const DETENTS = useMemo<[number, number, number]>(() => {
    const fullFrac = (SCREEN_HEIGHT - TAB_BAR_TOTAL) / SCREEN_HEIGHT;
    return [0.001, 0.55, fullFrac];
  }, [SCREEN_HEIGHT, TAB_BAR_TOTAL]);
  const detentAbsoluteHeights = useMemo<[number, number, number]>(
    () => DETENTS.map(d => Math.round(d * SCREEN_HEIGHT)) as [number, number, number],
    [DETENTS, SCREEN_HEIGHT],
  );
  const { setBusinesses, setActiveLocation, activeLocation, setOrder, order, businesses, jumpToPanel, goHome, goBack, showPanel, sheetHeight, setSheetHeight, setPanelData, setVarieties, varieties, setUserCoords, highlightedBizId, setHighlightedBizId, currentPanel, suppressCollapseBack, activeRootTab } = usePanel();
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
    setSheetHeight(0);
  }, []);

  useEffect(() => {
    if (pendingScreen === 'order-history') {
      clearPendingScreen();
      showPanel('order-history');
      setTimeout(() => TrueSheet.resize(SHEET_NAME, detentIndexForPanel('order-history')), 350);
    }
    if (pendingScreen === 'profile') {
      clearPendingScreen();
      showPanel('my-profile');
      setTimeout(() => TrueSheet.resize(SHEET_NAME, detentIndexForPanel('my-profile')), 350);
    }
    if (pendingScreen === 'NFCVerify') {
      clearPendingScreen();
      showPanel('verifyNFC');
      setTimeout(() => TrueSheet.resize(SHEET_NAME, detentIndexForPanel('verifyNFC')), 350);
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
          bottom: (sheetHeight > 50 ? sheetHeight : SCREEN_HEIGHT * 0.4) + 60,
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

  const getOpenStatus = (hours: string | null | undefined): { label: string; open: boolean } | null => {
    if (!hours) return null;
    // Expects e.g. "Mon–Fri 8am–6pm" or "8am–6pm" or "8:00–18:00"
    const now = new Date();
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const today = dayNames[now.getDay()];
    const lc = hours.toLowerCase();
    // If hours string mentions days and today isn't included, closed
    const hasDays = /mon|tue|wed|thu|fri|sat|sun/.test(lc);
    if (hasDays && !lc.includes(today)) return { label: 'closed today', open: false };
    // Extract time range like 8am–6pm or 8:00–18:00
    const timeMatch = lc.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[–\-to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (!timeMatch) return null;
    const toMin = (h: string, m: string, meridiem: string) => {
      let hour = parseInt(h);
      if (meridiem === 'pm' && hour !== 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      return hour * 60 + (parseInt(m) || 0);
    };
    const openMin = toMin(timeMatch[1], timeMatch[2], timeMatch[3]);
    const closeMin = toMin(timeMatch[4], timeMatch[5], timeMatch[6] || (openMin > toMin(timeMatch[4], timeMatch[5], 'am') ? 'pm' : 'am'));
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const open = nowMin >= openMin && nowMin < closeMin;
    return { label: open ? 'open now' : 'closed', open };
  };

  const handleTabPress = (tab: 'discover' | 'order' | 'me') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (tab === 'discover') {
      goHome();
      TrueSheet.resize(SHEET_NAME, detentIndexForPanel('home'));
    } else if (tab === 'order') {
      jumpToPanel('order-history');
      TrueSheet.resize(SHEET_NAME, detentIndexForPanel('order-history'));
    } else if (tab === 'me') {
      jumpToPanel('my-profile');
      TrueSheet.resize(SHEET_NAME, detentIndexForPanel('my-profile'));
    }
  };

  const locateBtnBottom = TAB_BOTTOM + TAB_HEIGHT + 12;
  const locateBtnVisible = sheetHeight < SCREEN_HEIGHT - insets.top - 40;

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
            <View style={[styles.pinCollection, { backgroundColor: c.markerBg }]} />
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
                : <View style={[styles.pinCircle, { backgroundColor: '#C0392B' }]} />
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
              setHighlightedBizId(b.id);
              showPanel('partner-detail', { partnerBusiness: b });
              TrueSheet.resize(SHEET_NAME, 1);
            }}
          >
            <View style={[
              styles.pinPartner,
              { borderColor: c.markerBg },
              isHighlighted && { backgroundColor: c.markerBg, width: 14, height: 14, borderRadius: 7 },
            ]} />
          </Marker>
          );
        })}

      </MapView>

      <TrueSheet
        name={SHEET_NAME}
        detents={DETENTS}
        initialDetentIndex={0}
        cornerRadius={4}
        style={{ backgroundColor: c.sheetBg }}
        dismissible={false}
        dimmed={false}
        grabber
        grabberOptions={{ color: 'rgba(0,0,0,0.2)' }}
        onPositionChange={onPositionChange}
        onDidPresent={(e: any) => {
          const idx = e.nativeEvent.index;
          const h = detentAbsoluteHeights[idx] ?? 0;
          setSheetHeight(h);
          setContentHeight(h);
          if (idx === 0 && currentPanel === 'partner-detail' && !suppressCollapseBack.current) {
            goBack();
          }
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

      {locateBtnVisible && (
        <TouchableOpacity
          style={[styles.locateBtn, { bottom: locateBtnBottom }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleLocateMe(); }}
          activeOpacity={0.5}
        >
          <Text style={[styles.locateBtnText, { color: c.muted }]}>↑</Text>
        </TouchableOpacity>
      )}

      <View style={[styles.tabBarOuter, { paddingBottom: insets.bottom + 8, backgroundColor: c.sheetBg }]}>
        <View
          accessibilityRole="tablist"
          style={[styles.tabPill, { backgroundColor: c.sheetBg }]}
        >
          {(['discover', 'order', 'me'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={styles.tabItem}
              onPress={() => handleTabPress(tab)}
              activeOpacity={0.6}
              accessibilityRole="tab"
              accessibilityLabel={tab}
              accessibilityState={{ selected: activeRootTab === tab }}
            >
              <Text style={[styles.tabLabel, { color: activeRootTab === tab ? c.text : c.muted }]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBarOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  tabPill: {
    flexDirection: 'row',
    borderRadius: 100,
    height: 44,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tabItem: {
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: fonts.dmMono,
    letterSpacing: 1.5,
  },
  locateBtn: {
    position: 'absolute',
    right: 20,
    padding: 10,
    zIndex: 10,
  },
  locateBtnText: {
    fontSize: 18,
    fontFamily: fonts.dmMono,
  },
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
    width: 16, height: 16, borderRadius: 2,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pinCircleWrap: {
    width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  pinCircle: {
    width: 10, height: 10, borderRadius: 5,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  pinPartner: {
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
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
  bizErrorText: { fontSize: 13, fontFamily: fonts.dmMono },
});
