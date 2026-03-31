import React, { useRef, useEffect, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { usePanel } from '../context/PanelContext';
import PanelNavigator from '../components/PanelNavigator';
import ProfileAvatar from '../components/ProfileAvatar';
import { fetchBusinesses } from '../lib/api';
import { colors, fonts } from '../theme';
import { getUserId, isVerified } from '../lib/userId';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_NAME = 'main-sheet';
const DETENTS: [number, number, number] = [0.12, 0.5, 1];


export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { setBusinesses, setActiveLocation, businesses, goHome } = usePanel();
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [verified, setVerified] = useState(false);
  const [sheetDetentIndex, setSheetDetentIndex] = useState(1);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    getUserId().then(setUserId).catch(() => {});
    isVerified().then(setVerified).catch(() => {});
    fetchBusinesses()
      .then((data: any[]) => setBusinesses(data))
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

  const collectionPoints = businesses.filter(b => b.type === 'collection');
  const partners = businesses.filter(b => b.type !== 'collection');

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: 43.65,
          longitude: -79.38,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
        showsUserLocation
        showsCompass={false}
        showsScale={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {collectionPoints.map(b => (
          <Marker
            key={`col-${b.id}`}
            coordinate={{ latitude: b.lat, longitude: b.lng }}
            onPress={() => handleMarkerPress(b)}
          >
            <View style={styles.pinCollection}>
              <Text style={styles.pinText}>✦</Text>
            </View>
          </Marker>
        ))}
        {partners.map(b => (
          <Marker
            key={`biz-${b.id}`}
            coordinate={{ latitude: b.lat, longitude: b.lng }}
            onPress={() => handleMarkerPress(b)}
          >
            <View style={styles.pinPartner}>
              <View style={styles.pinPartnerDot} />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Avatar top-left */}
      <View style={[styles.avatarBtn, { top: insets.top + 12 }]}>
        <ProfileAvatar verified={verified} userId={userId} />
      </View>

      {/* Float action button — visible only when sheet is fully peeked */}
      {sheetDetentIndex === 0 && (
        <View style={[styles.floatBtns, { bottom: SCREEN_HEIGHT * DETENTS[0] + 16 }]}>
          <TouchableOpacity
            style={styles.floatBtn}
            onPress={() => TrueSheet.present(SHEET_NAME, 1)}
            activeOpacity={0.85}
          >
            <Text style={styles.floatBtnText}>Order</Text>
          </TouchableOpacity>
        </View>
      )}

      <TrueSheet
        name={SHEET_NAME}
        detents={DETENTS}
        initialDetentIndex={1}
        cornerRadius={20}
        onDetentChange={({ nativeEvent: { index } }) => setSheetDetentIndex(index)}
        grabber
        grabberOptions={{ color: 'rgba(0,0,0,0.2)' }}
        style={{ flex: 1, minHeight: SCREEN_HEIGHT * 0.9 }}
      >
        <PanelNavigator />
      </TrueSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  avatarBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
  },
  floatBtns: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
  floatBtn: {
    backgroundColor: colors.green,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  floatBtnText: {
    color: colors.cream,
    fontSize: 14,
    fontFamily: fonts.dmSans,
    fontWeight: '700',
  },
  pinCollection: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pinText: {
    fontSize: 10,
    color: '#fff',
  },
  pinPartner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinPartnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.green,
  },
});
