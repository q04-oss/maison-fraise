import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, LayoutChangeEvent } from 'react-native';
import MapView, { Marker, UserLocationChangeEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../context/PanelContext';
import PanelNavigator from '../components/PanelNavigator';
import { fetchBusinesses } from '../lib/api';
import { useColors } from '../theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_NAME = 'main-sheet';
const COLLAPSED_HEIGHT = 80; // px — grabber + search bar row
const DETENTS: [number, number, number] = [COLLAPSED_HEIGHT / SCREEN_HEIGHT, 0.5, 1];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { setBusinesses, setActiveLocation, setOrder, businesses, showPanel, goHome, sheetHeight, setSheetHeight } = usePanel();
  const c = useColors();
  const [contentHeight, setContentHeight] = useState(SCREEN_HEIGHT * 0.55);
  const mapRef = useRef<MapView>(null);
  const userCoords = useRef<{ latitude: number; longitude: number } | null>(null);

  const onSheetLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setContentHeight(h);
  }, []);

  const onPositionChange = useCallback((event: any) => {
    const { position } = event.nativeEvent;
    setSheetHeight(SCREEN_HEIGHT - position);
  }, [setSheetHeight]);

  useEffect(() => {
    // Seed initial sheet height (medium detent = 50%) so FABs and HomePanel render correctly before first scroll
    setSheetHeight(SCREEN_HEIGHT * 0.5);
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
    setOrder({ location_id: biz.id, location_name: biz.name });
    showPanel('location');
    TrueSheet.present(SHEET_NAME, 1);
    mapRef.current?.animateToRegion({
      latitude: biz.lat - 0.003,
      longitude: biz.lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    }, 400);
  };

  const handleLocateMe = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    mapRef.current?.animateToRegion({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
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
          bottom: SCREEN_HEIGHT * 0.5 + 60,
          left: 60,
        },
        animated: true,
      }
    );
  };

  const collectionPoints = businesses.filter(b => b.type === 'collection');
  const partners = businesses.filter(b => b.type !== 'collection');

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
        style={{ backgroundColor: '#FFFFFF' }}
        dismissible={false}
        dimmed={false}
        grabber
        grabberOptions={{ color: 'rgba(0,0,0,0.2)' }}
        onPositionChange={onPositionChange}
        scrollable
      >
        <View style={{ height: contentHeight }} onLayout={onSheetLayout}>
          <PanelNavigator />
        </View>
      </TrueSheet>

      {/* FABs float above the sheet, hide at full screen */}
      {fabsVisible && (
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
      )}
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
