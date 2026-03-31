import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, LayoutChangeEvent } from 'react-native';
import MapView, { Marker, UserLocationChangeEvent } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../context/PanelContext';
import { useTheme } from '../context/ThemeContext';
import PanelNavigator from '../components/PanelNavigator';
import { fetchBusinesses } from '../lib/api';
import { useColors } from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_NAME = 'main-sheet';
const DETENTS: [number, number, number] = [0.18, 0.5, 1];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { setBusinesses, setActiveLocation, businesses, goHome } = usePanel();
  const { isDark } = useTheme();
  const c = useColors();
  const [contentHeight, setContentHeight] = useState(SCREEN_HEIGHT * 0.55);
  const mapRef = useRef<MapView>(null);
  const userCoords = useRef<{ latitude: number; longitude: number } | null>(null);

  const onSheetLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setContentHeight(h);
  }, []);

  useEffect(() => {
    fetchBusinesses()
      .then((data: any[]) => {
        setBusinesses(data);
        // Auto-select the first collection point so location_id is never null
        const defaultCollection = data.find(b => b.type === 'collection');
        if (defaultCollection) setActiveLocation(defaultCollection);
      })
      .catch(() => {});
  }, []);

  const handleMarkerPress = (biz: any) => {
    setActiveLocation(biz);
    goHome();
    TrueSheet.present(SHEET_NAME, 1);
    mapRef.current?.animateToRegion({
      latitude: biz.lat - 0.003,
      longitude: biz.lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 400);
  };

  const handleLocateMe = () => {
    if (!userCoords.current) return;
    mapRef.current?.animateToRegion({
      latitude: userCoords.current.latitude,
      longitude: userCoords.current.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 400);
  };

  const handleShowAll = () => {
    if (businesses.length === 0) return;
    mapRef.current?.fitToCoordinates(
      businesses.map(b => ({ latitude: b.lat, longitude: b.lng })),
      {
        edgePadding: {
          top: insets.top + 60,
          right: 60,
          bottom: SCREEN_HEIGHT * DETENTS[1] + 60,
          left: 60,
        },
        animated: true,
      }
    );
  };

  const collectionPoints = businesses.filter(b => b.type === 'collection');
  const partners = businesses.filter(b => b.type !== 'collection');

  const fabBottom = SCREEN_HEIGHT * DETENTS[0] + 16;

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
        userInterfaceStyle={isDark ? 'dark' : 'light'}
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
        {partners.map(b => (
          <Marker
            key={`biz-${b.id}`}
            coordinate={{ latitude: b.lat, longitude: b.lng }}
            onPress={() => handleMarkerPress(b)}
          >
            <View style={[styles.pinPartner, { borderColor: c.markerBg }]}>
              <View style={[styles.pinPartnerDot, { backgroundColor: c.markerBg }]} />
            </View>
          </Marker>
        ))}
      </MapView>

      <TrueSheet
        name={SHEET_NAME}
        detents={DETENTS}
        initialDetentIndex={1}
        cornerRadius={20}
        backgroundBlur={isDark ? 'system-ultra-thin-material-dark' : 'system-material'}
        dismissible={false}
        grabber
        grabberOptions={{ color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)' }}
      >
        <View style={{ height: contentHeight }} onLayout={onSheetLayout}>
          <PanelNavigator />
        </View>
      </TrueSheet>

      {/* FABs rendered after TrueSheet so they sit on top */}
      <View style={[styles.fabStack, { bottom: fabBottom }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.fab} onPress={handleShowAll} activeOpacity={0.8}>
          <Text style={styles.fabIcon}>🍓</Text>
          <Text style={styles.fabLabel}>Nearby</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={handleLocateMe} activeOpacity={0.8}>
          <Text style={styles.fabIcon}>⊕</Text>
          <Text style={styles.fabLabel}>Locate</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fabStack: {
    position: 'absolute',
    right: 16,
    gap: 12,
    zIndex: 10,
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    gap: 3,
  },
  fabIcon: {
    fontSize: 28,
  },
  fabLabel: {
    fontSize: 11,
    color: '#1C1C1E',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  pinCollection: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pinCollectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  pinPartner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  pinPartnerDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
