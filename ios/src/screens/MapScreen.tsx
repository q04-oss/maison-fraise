import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, LayoutChangeEvent, Alert, ActivityIndicator, Animated } from 'react-native';
import MapView, { Marker, UserLocationChangeEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../context/PanelContext';
import PanelNavigator from '../components/PanelNavigator';
import { fetchBusinesses, updatePushToken } from '../lib/api';
import { useColors } from '../theme';
import { useApp } from '../../App';

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

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const DETENTS = useMemo<[number, number, number]>(() => [COLLAPSED_HEIGHT / SCREEN_HEIGHT, 0.5, 1], [SCREEN_HEIGHT]);
  const { setBusinesses, setActiveLocation, setOrder, order, businesses, jumpToPanel, goHome, showPanel, sheetHeight, setSheetHeight } = usePanel();
  const { pendingScreen, pendingData, clearPendingScreen, pushToken } = useApp();
  const c = useColors();
  const [contentHeight, setContentHeight] = useState(SCREEN_HEIGHT * 0.55);
  const [bizError, setBizError] = useState(false);
  const [bizLoading, setBizLoading] = useState(true);
  const [isVerified, setIsVerified] = useState(false);
  const mapRef = useRef<MapView>(null);
  const userCoords = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('verified').then(v => setIsVerified(v === 'true')).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pushToken) return;
    AsyncStorage.getItem('user_db_id').then(id => {
      if (id) updatePushToken(parseInt(id, 10), pushToken).catch(() => {});
    }).catch(() => {});
  }, [pushToken]);

  const onSheetLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setContentHeight(h);
  }, []);

  const onPositionChange = useCallback((event: any) => {
    const { position } = event.nativeEvent;
    setSheetHeight(SCREEN_HEIGHT - position);
  }, [SCREEN_HEIGHT, setSheetHeight]);

  useEffect(() => {
    setSheetHeight(Math.round(SCREEN_HEIGHT * 0.5));
  }, []);

  useEffect(() => {
    if (pendingScreen === 'nfc') {
      clearPendingScreen();
      jumpToPanel('nfc');
      TrueSheet.present(SHEET_NAME, 2);
    }
    if (pendingScreen === 'popup') {
      clearPendingScreen();
      goHome();
      TrueSheet.present(SHEET_NAME, 1);
    }
    if (pendingScreen === 'dj-offer' && pendingData?.popup_id) {
      const popupBiz = businesses.find(b => b.id === pendingData.popup_id);
      clearPendingScreen();
      if (popupBiz) {
        setActiveLocation(popupBiz);
        jumpToPanel('dj-offer');
        TrueSheet.present(SHEET_NAME, 2);
      }
    }
    if (pendingScreen === 'nomination' && pendingData?.popup_id) {
      const popupBiz = businesses.find(b => b.id === pendingData.popup_id);
      clearPendingScreen();
      if (popupBiz) {
        setActiveLocation(popupBiz);
        jumpToPanel('nomination');
        TrueSheet.present(SHEET_NAME, 2);
      }
    }
    if ((pendingScreen === 'audition-result' || pendingScreen === 'campaign-commission') && pendingData?.popup_id) {
      const popupBiz = businesses.find(b => b.id === pendingData.popup_id);
      clearPendingScreen();
      if (popupBiz) {
        setActiveLocation(popupBiz);
        jumpToPanel('campaign-commission');
        TrueSheet.present(SHEET_NAME, 2);
      }
    }
    if (pendingScreen === 'contract-offer') {
      clearPendingScreen();
      jumpToPanel('contract-offer');
      TrueSheet.present(SHEET_NAME, 2);
    }
  }, [pendingScreen, businesses]);

  const loadBusinesses = () => {
    setBizError(false);
    setBizLoading(true);
    fetchBusinesses()
      .then((data: any[]) => {
        setBusinesses(data);
        const defaultCollection = data.find(b => b.type === 'collection');
        if (defaultCollection && !order.location_id) {
          setActiveLocation(defaultCollection);
          setOrder({ location_id: defaultCollection.id, location_name: defaultCollection.name });
        }
      })
      .catch(() => setBizError(true))
      .finally(() => setBizLoading(false));
  };

  useEffect(() => { loadBusinesses(); }, []);

  const doMarkerNav = (biz: any) => {
    setActiveLocation(biz);
    goHome();
    setOrder({ location_id: biz.id, location_name: biz.name });
    jumpToPanel('location');
    setTimeout(() => TrueSheet.present(SHEET_NAME, 2), 350);
    mapRef.current?.animateToRegion({
      latitude: biz.lat - 0.003,
      longitude: biz.lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 400);
  };

  const handleMarkerPress = (biz: any) => {
    if (order.variety_id) {
      Alert.alert(
        'Switch location?',
        'Your current order selection will be cleared.',
        [
          { text: 'Keep order', style: 'cancel' },
          { text: 'Switch', style: 'destructive', onPress: () => doMarkerNav(biz) },
        ]
      );
    } else {
      doMarkerNav(biz);
    }
  };

  const handlePartnerPress = (biz: any) => {
    setActiveLocation(biz);
    showPanel('partner-detail');
    setTimeout(() => TrueSheet.present(SHEET_NAME, 2), 350);
    mapRef.current?.animateToRegion({
      latitude: biz.lat - 0.003,
      longitude: biz.lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 400);
  };

  const handlePopupMarkerPress = (biz: any) => {
    setActiveLocation(biz);
    showPanel('popup-detail');
    setTimeout(() => TrueSheet.present(SHEET_NAME, 2), 350);
    mapRef.current?.animateToRegion({
      latitude: biz.lat - 0.003,
      longitude: biz.lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 400);
  };

  const handleUnverifiedPopupPress = () => {
    Alert.alert(
      'Verified members only',
      'Collect your first order in person, then tap the NFC chip inside your box lid to verify.'
    );
  };

  const handleLocateMe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location access needed', 'Enable location in Settings to use this feature.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    mapRef.current?.animateToRegion({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
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

  const fabBottom = sheetHeight + 16;
  const fabsVisible = sheetHeight < SCREEN_HEIGHT - insets.top - 40;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: 45.4734,
          longitude: -73.5773,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        userInterfaceStyle="light"
        showsUserLocation
        showsCompass={false}
        showsScale={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onUserLocationChange={(e: UserLocationChangeEvent) => {
          const coord = e.nativeEvent.coordinate;
          if (coord) userCoords.current = { latitude: coord.latitude, longitude: coord.longitude };
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
          </Marker>
        ))}

        {popups.map(b => {
          const live = isLive(b);
          if (isVerified) {
            return (
              <Marker
                key={`popup-${b.id}`}
                coordinate={{ latitude: b.lat, longitude: b.lng }}
                onPress={() => handlePopupMarkerPress(b)}
                tracksViewChanges={live}
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
          }
          // Unverified — greyed out
          return (
            <Marker
              key={`popup-grey-${b.id}`}
              coordinate={{ latitude: b.lat, longitude: b.lng }}
              onPress={handleUnverifiedPopupPress}
            >
              <View style={styles.pinPopup}>
                <View style={[styles.pinPopupRing, { borderColor: c.border }]} />
                <View style={[styles.pinPopupDot, { backgroundColor: c.border }]} />
              </View>
            </Marker>
          );
        })}

        {auditionPopups.map(b => {
          const live = isLive(b);
          if (isVerified) {
            return (
              <Marker
                key={`audition-${b.id}`}
                coordinate={{ latitude: b.lat, longitude: b.lng }}
                onPress={() => handlePopupMarkerPress(b)}
                tracksViewChanges={live}
              >
                <AuditionPopupPin live={live} />
              </Marker>
            );
          }
          return (
            <Marker
              key={`audition-grey-${b.id}`}
              coordinate={{ latitude: b.lat, longitude: b.lng }}
              onPress={handleUnverifiedPopupPress}
            >
              <View style={styles.pinPopup}>
                <View style={[styles.pinAuditionRing, { borderColor: '#ccc' }]} />
                <View style={[styles.pinAuditionDot, { backgroundColor: '#ccc' }]} />
              </View>
            </Marker>
          );
        })}

        {partners.map(b => (
          <Marker
            key={`biz-${b.id}`}
            coordinate={{ latitude: b.lat, longitude: b.lng }}
            onPress={() => handlePartnerPress(b)}
            tracksViewChanges={false}
          >
            <View style={[styles.pinPartner, { borderColor: c.markerBg }]}>
              <View style={[styles.pinPartnerDot, { backgroundColor: c.markerBg }]} />
              {b.placed_user_name && (
                <View style={styles.pinPlacedDot} />
              )}
            </View>
          </Marker>
        ))}
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
        }}
        scrollable
      >
        <View style={{ height: contentHeight }} onLayout={onSheetLayout}>
          <PanelNavigator />
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

      <TouchableOpacity
        style={[styles.profileBtn, { backgroundColor: c.card, top: insets.top + 12 }]}
        onPress={() => { jumpToPanel('profile'); setTimeout(() => TrueSheet.present(SHEET_NAME, 1), 350); }}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>❋</Text>
      </TouchableOpacity>

      {fabsVisible && (
        <View style={[styles.fabStack, { bottom: fabBottom }]} pointerEvents="box-none">
          <TouchableOpacity style={[styles.fab, { backgroundColor: c.card }]} onPress={handleShowAll} activeOpacity={0.8}>
            <Text style={styles.fabIcon}>🍓</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.fab, { backgroundColor: c.card }]} onPress={handleLocateMe} activeOpacity={0.8}>
            <Text style={styles.fabIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  profileBtn: {
    position: 'absolute',
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    zIndex: 10,
  },
  fabStack: {
    position: 'absolute',
    right: 16,
    gap: 12,
    zIndex: 10,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  fabIcon: { fontSize: 22 },
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
    backgroundColor: '#fff', borderWidth: 2.5,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  pinPartnerDot: { width: 5, height: 5, borderRadius: 3 },
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
});
