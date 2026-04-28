import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import {
  View, Text, TouchableOpacity, StyleSheet,
  useWindowDimensions, LayoutChangeEvent, AppState,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel, FraiseEvent } from '../context/PanelContext';
import PanelNavigator, { detentIndexForPanel } from '../components/PanelNavigator';
import { fetchEvents, fetchMe, fetchMyClaims, getMemberToken, updatePushToken } from '../lib/api';
import { useColors, fonts } from '../theme';
import { useApp } from '../../App';

const SHEET_NAME = 'main-sheet';

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

  const {
    showPanel, jumpToPanel, goHome, goBack,
    setSheetHeight, currentPanel, suppressCollapseBack,
    activeRootTab, lastNavType,
    setMember, setEvents, setClaims, events, setActiveEvent,
  } = usePanel();
  const { pushToken, pendingScreen, clearPendingScreen } = useApp();
  const c = useColors();

  const [contentHeight, setContentHeight] = useState(SCREEN_HEIGHT * 0.55);
  const mapRef = useRef<any>(null);
  const userCoords = useRef<{ latitude: number; longitude: number } | null>(null);

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const bootstrap = useCallback(async () => {
    const token = await getMemberToken();
    if (!mountedRef.current) return;
    if (token) {
      const [me, claims] = await Promise.all([fetchMe(), fetchMyClaims()]);
      if (!mountedRef.current) return;
      if (me) setMember(me);
      setClaims(claims);
    }
    const evs = await fetchEvents();
    if (!mountedRef.current) return;
    setEvents(evs);
  }, []);

  useEffect(() => { bootstrap(); }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') bootstrap();
    });
    return () => sub.remove();
  }, [bootstrap]);

  // Push token sync
  useEffect(() => {
    if (!pushToken) return;
    getMemberToken().then(t => { if (t) updatePushToken(pushToken).catch(() => {}); });
  }, [pushToken]);

  // Pending screen from notification tap
  useEffect(() => {
    if (pendingScreen === 'my-claims') {
      clearPendingScreen();
      jumpToPanel('my-claims');
      setTimeout(() => TrueSheet.resize(SHEET_NAME, 2), 350);
    }
  }, [pendingScreen, clearPendingScreen, jumpToPanel]);

  // ── Map event pins ─────────────────────────────────────────────────────────

  const eventsWithCoords = events.filter(e => e.business_lat && e.business_lng);

  const handlePinPress = (ev: FraiseEvent) => {
    setActiveEvent(ev);
    showPanel('event-detail', { event: ev });
    setTimeout(() => TrueSheet.resize(SHEET_NAME, 1), 350);
    if (ev.business_lat && ev.business_lng) {
      mapRef.current?.animateToRegion({
        latitude: ev.business_lat - 0.003,
        longitude: ev.business_lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 400);
    }
  };

  // ── Sheet ──────────────────────────────────────────────────────────────────

  const onSheetLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setContentHeight(h);
  }, []);

  const onPositionChange = useCallback((event: any) => {
    const h = SCREEN_HEIGHT - event.nativeEvent.position;
    setSheetHeight(h);
    setContentHeight(h);
  }, [SCREEN_HEIGHT, setSheetHeight]);

  useEffect(() => { setSheetHeight(0); }, []);

  // ── Tab bar ────────────────────────────────────────────────────────────────

  const handleTabPress = (tab: 'discover' | 'claims' | 'account') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (tab === 'discover') {
      goHome();
      TrueSheet.resize(SHEET_NAME, detentIndexForPanel('home'));
    } else if (tab === 'claims') {
      jumpToPanel('my-claims');
      TrueSheet.resize(SHEET_NAME, detentIndexForPanel('my-claims'));
    } else {
      jumpToPanel('account');
      TrueSheet.resize(SHEET_NAME, detentIndexForPanel('account'));
    }
  };

  // ── Locate me ──────────────────────────────────────────────────────────────

  const handleLocateMe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    userCoords.current = coords;
    mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: 45.5017, longitude: -73.5673, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
        mapType="mutedStandard"
        userInterfaceStyle="light"
        showsUserLocation
        showsCompass={false}
        showsScale={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {eventsWithCoords.map(ev => (
          <Marker
            key={`ev-${ev.id}`}
            coordinate={{ latitude: ev.business_lat!, longitude: ev.business_lng! }}
            onPress={() => handlePinPress(ev)}
          >
            <View style={[
              styles.pin,
              ev.status === 'threshold_met' && styles.pinReady,
              ev.status === 'confirmed'     && styles.pinConfirmed,
            ]} />
          </Marker>
        ))}
      </MapView>

      <TrueSheet
        name={SHEET_NAME}
        detents={DETENTS}
        initialDetentIndex={1}
        cornerRadius={4}
        style={{ backgroundColor: c.sheetBg }}
        dismissible={false}
        dimmed={false}
        grabber
        grabberOptions={{ color: 'rgba(0,0,0,0.18)' }}
        onPositionChange={onPositionChange}
        onDidPresent={(e: any) => {
          const idx = e.nativeEvent.index;
          const h = detentAbsoluteHeights[idx] ?? 0;
          setSheetHeight(h);
          setContentHeight(h);
          if (idx === 0 && currentPanel === 'event-detail' && !suppressCollapseBack.current) {
            goBack();
          }
        }}
        scrollable
      >
        <View style={{ height: contentHeight, backgroundColor: c.sheetBg }} onLayout={onSheetLayout}>
          <PanelNavigator />
        </View>
      </TrueSheet>

      <TouchableOpacity
        style={[styles.locateBtn, { bottom: insets.bottom + TAB_BAR_HEIGHT + 12 }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleLocateMe(); }}
        activeOpacity={0.5}
      >
        <Text style={[styles.locateBtnText, { color: c.muted }]}>↑</Text>
      </TouchableOpacity>

      <View
        accessibilityRole="tablist"
        style={[styles.tabBar, {
          bottom: 0,
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          borderTopColor: c.border,
          backgroundColor: c.sheetBg,
        }]}
      >
        {(['discover', 'claims', 'account'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={styles.tabItem}
            onPress={() => handleTabPress(tab)}
            activeOpacity={0.6}
            accessibilityRole="tab"
            accessibilityLabel={tab}
            accessibilityState={{ selected: activeRootTab === tab }}
          >
            <Text style={[styles.tabLabel, { color: activeRootTab === tab ? c.text : c.muted }]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pin: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1C1C1E',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  pinReady: { backgroundColor: '#27AE60' },
  pinConfirmed: { backgroundColor: '#1C1C1E', width: 12, height: 12, borderRadius: 6 },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 11, fontFamily: fonts.dmMono, letterSpacing: 1.5 },
  locateBtn: { position: 'absolute', right: 20, padding: 10, zIndex: 10 },
  locateBtnText: { fontSize: 18, fontFamily: fonts.dmMono },
});
