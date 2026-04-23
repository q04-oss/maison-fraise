import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, LayoutChangeEvent, Alert, ActivityIndicator, Animated, AppState, Linking } from 'react-native';
import MapView, { Marker, Callout, UserLocationChangeEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../context/PanelContext';
import PanelNavigator, { detentIndexForPanel } from '../components/PanelNavigator';
import OfflineBanner from '../components/OfflineBanner';
import PanelErrorBoundary from '../components/PanelErrorBoundary';
import BeaconNudge from '../components/BeaconNudge';
import MessageBanner from '../components/MessageBanner';
import { loadAndMonitorBeacons } from '../lib/beaconService';
import { initBeaconRecommendations } from '../lib/BeaconRecommendationService';
import { fetchBusinesses, fetchVarieties, updatePushToken, deleteAuthToken } from '../lib/api';
import { STRAWBERRIES } from '../data/seed';
import { useColors, fonts, SPACING } from '../theme';
import { useApp } from '../../App';
import ARBoxModule from '../lib/NativeARBoxModule';
import { haversineKm, formatDistanceKm, getOpenStatus, formatHours24 } from '../lib/geo';

const SHEET_NAME = 'main-sheet';

const AUDITION_COLOR = '#B8860B';

// ─── Pin callout ──────────────────────────────────────────────────────────────

interface PinCalloutProps {
  name: string;
  hours?: string | null;
  hoursLabel?: string | null;
  hoursOpen?: boolean | null;
  subtitle?: string | null;
  onPress: () => void;
}

function PinCallout({ name, hoursLabel, hoursOpen, hours, subtitle, onPress }: PinCalloutProps) {
  const hours24 = hours ? formatHours24(hours) : null;
  return (
    <Callout onPress={onPress} tooltip>
      <View style={calloutStyles.container}>
        <Text style={calloutStyles.name} numberOfLines={1} ellipsizeMode="tail">{name}</Text>
        {hoursLabel ? (
          <View style={calloutStyles.row}>
            <View style={[calloutStyles.dot, { backgroundColor: hoursOpen ? '#4CAF50' : '#9E9E9E' }]} />
            <Text style={[calloutStyles.status, { color: hoursOpen ? '#4CAF50' : '#9E9E9E' }]} numberOfLines={1}>
              {hoursLabel}
            </Text>
          </View>
        ) : null}
        {hours24 ? (
          <Text style={calloutStyles.hoursStr} numberOfLines={1} ellipsizeMode="tail">{hours24}</Text>
        ) : null}
        {subtitle ? <Text style={calloutStyles.subtitle} numberOfLines={1} ellipsizeMode="tail">{subtitle}</Text> : null}
        <Text style={calloutStyles.cta}>tap to open  →</Text>
      </View>
    </Callout>
  );
}

const calloutStyles = StyleSheet.create({
  container: {
    backgroundColor: '#FDFCFA',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 160,
    maxWidth: 220,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  name: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', letterSpacing: 0.1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontSize: 11, fontWeight: '500' },
  hoursStr: { fontSize: 10, color: '#9E9E9E', marginLeft: 4 },
  subtitle: { fontSize: 10, color: '#9E9E9E', letterSpacing: 0.3 },
  cta: { fontSize: 9, color: '#C9973A', marginTop: 2, letterSpacing: 0.5 },
});

function PopupCallout({ biz, live, onPress }: { biz: any; live: boolean; onPress: () => void }) {
  const confirmed = biz.food_popup_status === 'confirmed';
  const paidCount: number = biz.food_paid_count ?? 0;
  const threshold: number | null = biz.min_orders_to_confirm ?? null;

  const dateStr = confirmed && biz.starts_at
    ? new Date(biz.starts_at).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  return (
    <Callout onPress={onPress} tooltip>
      <View style={calloutStyles.container}>
        <View style={calloutStyles.row}>
          <View style={[calloutStyles.dot, { backgroundColor: live ? '#C0392B' : '#C0392B' }]} />
          <Text style={[calloutStyles.status, { color: '#C0392B' }]} numberOfLines={1}>
            {live ? 'LIVE NOW' : confirmed ? 'CONFIRMED' : 'POPUP'}
          </Text>
        </View>
        <Text style={calloutStyles.name} numberOfLines={1}>{biz.name}</Text>
        {confirmed && dateStr
          ? <Text style={calloutStyles.subtitle} numberOfLines={1}>{dateStr}</Text>
          : threshold
            ? <Text style={calloutStyles.subtitle} numberOfLines={1}>{paidCount} of {threshold} to confirm</Text>
            : paidCount > 0
              ? <Text style={calloutStyles.subtitle} numberOfLines={1}>{paidCount} prepaid</Text>
              : null
        }
        <Text style={calloutStyles.cta}>tap to open  →</Text>
      </View>
    </Callout>
  );
}

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
  const TAB_BAR_HEIGHT = 44;
  const DETENTS = useMemo<[number, number, number]>(() => {
    const fullFrac = (SCREEN_HEIGHT - TAB_BAR_HEIGHT - insets.bottom) / SCREEN_HEIGHT;
    return [0.001, 0.55, fullFrac];
  }, [SCREEN_HEIGHT, insets.bottom]);
  const detentAbsoluteHeights = useMemo<[number, number, number]>(
    () => DETENTS.map(d => Math.round(d * SCREEN_HEIGHT)) as [number, number, number],
    [DETENTS, SCREEN_HEIGHT],
  );
  const { setBusinesses, setActiveLocation, activeLocation, setOrder, order, businesses, jumpToPanel, goHome, goBack, showPanel, sheetHeight, setSheetHeight, setPanelData, setVarieties, varieties, setUserCoords, highlightedBizId, setHighlightedBizId, currentPanel, suppressCollapseBack, activeRootTab, curatedMap, setCuratedMap } = usePanel();
  const { pendingScreen, pendingData, clearPendingScreen, pushToken, incomingBanner, clearIncomingBanner } = useApp();
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
    if (pendingScreen === 'messages') {
      clearPendingScreen();
      const userId = pendingData?.user_id;
      showPanel('conversations', userId ? { user_id: userId } : undefined);
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
    if (b.food_popup_status !== 'confirmed') return false;
    if (!b.starts_at) return false;
    const start = new Date(b.starts_at);
    const end = b.ends_at
      ? new Date(b.ends_at)
      : new Date(start.getTime() + 4 * 60 * 60 * 1000);
    const now = new Date();
    return now >= start && now < end;
  };

  const now = new Date();
  const allValidBusinesses = businesses.filter(b => b.lat && b.lng);
  const validBusinesses = curatedMap
    ? allValidBusinesses.filter(b => curatedMap.businessIds.includes(b.id))
    : allValidBusinesses;
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

  const locateBtnBottom = insets.bottom + TAB_BAR_HEIGHT + 12;
  const locateBtnVisible = sheetHeight < SCREEN_HEIGHT - insets.top - 40;

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

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <BeaconNudge />
      {incomingBanner && (
        <MessageBanner
          senderName={incomingBanner.senderName}
          body={incomingBanner.body}
          onTap={() => {
            clearIncomingBanner();
            showPanel('conversations', { user_id: incomingBanner.userId });
            setTimeout(() => TrueSheet.resize(SHEET_NAME, 2), 350);
          }}
          onDismiss={clearIncomingBanner}
        />
      )}
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
        {collectionPoints.map(b => {
          const status = getOpenStatus((b as any).hours);
          const dist = formatDistance(b.lat, b.lng);
          return (
            <Marker
              key={`col-${b.id}`}
              coordinate={{ latitude: b.lat, longitude: b.lng }}
            >
              <View style={[styles.pinCollection, { backgroundColor: c.markerBg }]} />
              <PinCallout
                name={b.name}
                hours={(b as any).hours}
                hoursLabel={status?.label ?? null}
                hoursOpen={status?.open ?? null}
                subtitle={dist ?? ((b as any).neighbourhood ?? (b as any).address ?? null)}
                onPress={() => handleMarkerPress(b)}
              />
            </Marker>
          );
        })}

        {popups.map(b => {
          const live = isLive(b);
          return (
            <Marker
              key={`popup-${b.id}`}
              coordinate={{ latitude: b.lat, longitude: b.lng }}
              tracksViewChanges={live}
            >
              {live
                ? <LivePopupPin color="#C0392B" />
                : <View style={[styles.pinCircle, { backgroundColor: '#C0392B' }]} />
              }
              <PopupCallout biz={b} live={live} onPress={() => handlePopupPress(b)} />
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
          const status = getOpenStatus((b as any).hours);
          const dist = formatDistance(b.lat, b.lng);
          return (
            <Marker
              key={`biz-${b.id}`}
              coordinate={{ latitude: b.lat, longitude: b.lng }}
              tracksViewChanges={isHighlighted}
              onPress={() => setHighlightedBizId(b.id)}
            >
              <View style={[
                styles.pinPartner,
                { borderColor: c.markerBg },
                isHighlighted && { backgroundColor: c.markerBg, width: 14, height: 14, borderRadius: 7 },
              ]} />
              <PinCallout
                name={b.name}
                hours={(b as any).hours}
                hoursLabel={status?.label ?? null}
                hoursOpen={status?.open ?? null}
                subtitle={dist ?? ((b as any).neighbourhood ?? (b as any).address ?? null)}
                onPress={() => {
                  setHighlightedBizId(b.id);
                  showPanel('partner-detail', { partnerBusiness: b });
                  TrueSheet.resize(SHEET_NAME, 1);
                }}
              />
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

      {curatedMap && (
        <View style={[styles.curatedStrip, { bottom: TAB_BAR_HEIGHT + insets.bottom, backgroundColor: c.sheetBg, borderTopColor: c.border }]}>
          <Text style={[styles.curatedText, { color: c.text }]} numberOfLines={1}>
            {curatedMap.authorName}'s map  ·  {curatedMap.name}
          </Text>
          <TouchableOpacity onPress={() => { setCuratedMap(null); }} activeOpacity={0.6}>
            <Text style={[styles.curatedExit, { color: c.muted }]}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      <View
        accessibilityRole="tablist"
        style={[styles.tabBar, { bottom: 0, height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom, borderTopColor: c.border, backgroundColor: c.sheetBg }]}
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

      {locateBtnVisible && (
        <TouchableOpacity
          style={[styles.locateBtn, { bottom: locateBtnBottom }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleLocateMe(); }}
          activeOpacity={0.5}
        >
          <Text style={[styles.locateBtnText, { color: c.muted }]}>↑</Text>
        </TouchableOpacity>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  curatedStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
  },
  curatedText: { flex: 1, fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 0.5 },
  curatedExit: { fontSize: 20, paddingLeft: 12 },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
  },
  tabItem: {
    flex: 1,
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
