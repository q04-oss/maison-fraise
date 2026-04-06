import { Platform, NativeEventEmitter, NativeModules } from 'react-native';
import Beacons from 'react-native-beacons-manager';
import * as Notifications from 'expo-notifications';
import { fetchBeacons, fetchBeaconShopUser } from './api';

export interface BeaconRegion {
  uuid: string;
  major: number;
  minor: number;
  business_id: number;
  business_name: string;
}

let knownBeacons: BeaconRegion[] = [];
let monitoring = false;
let onNearbyShop: ((shopUserId: number, shopName: string, businessId: number) => void) | null = null;
let regionDidEnterSubscription: { remove: () => void } | null = null;

export function setOnNearbyShop(cb: typeof onNearbyShop) {
  onNearbyShop = cb;
}

export async function loadAndMonitorBeacons() {
  if (Platform.OS !== 'ios') return;
  if (monitoring) return;

  try {
    knownBeacons = await fetchBeacons();
    if (knownBeacons.length === 0) return;

    await Beacons.requestAlwaysAuthorization();

    // Register a region per unique UUID
    const uuids = [...new Set(knownBeacons.map(b => b.uuid))];
    for (const uuid of uuids) {
      Beacons.startMonitoringForRegion({ identifier: uuid, uuid });
      Beacons.startRangingBeaconsInRegion({ identifier: uuid, uuid });
    }

    // Region entry — user walked into range
    const BeaconsEventEmitter = new NativeEventEmitter(NativeModules.RNiBeacon);
    regionDidEnterSubscription = BeaconsEventEmitter.addListener('regionDidEnter', async (region: any) => {
      const match = knownBeacons.find(b => b.uuid.toLowerCase() === region.uuid?.toLowerCase());
      if (!match) return;

      const shopUser = await fetchBeaconShopUser(match.business_id).catch(() => null);
      if (!shopUser) return;

      if (onNearbyShop) {
        onNearbyShop(shopUser.id, match.business_name, match.business_id);
      } else {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: match.business_name,
            body: 'Strawberries available nearby — tap to see today\'s offer.',
            data: { screen: 'messages', user_id: shopUser.id },
          },
          trigger: null,
        });
      }
    });

    monitoring = true;
  } catch (err) {
    // Silently fail — BLE is a nice-to-have, not core
  }
}

export function stopMonitoring() {
  if (!monitoring) return;
  regionDidEnterSubscription?.remove();
  regionDidEnterSubscription = null;
  for (const beacon of knownBeacons) {
    Beacons.stopMonitoringForRegion({ identifier: beacon.uuid, uuid: beacon.uuid });
    Beacons.stopRangingBeaconsInRegion({ identifier: beacon.uuid, uuid: beacon.uuid });
  }
  monitoring = false;
}

// ─── HealthKit beacon recommendation exports ──────────────────────────────────
// Used by BeaconRecommendationService to monitor a single platform-wide region
// and trigger personalised menu recommendations on venue entry.

// Platform UUID used for all Maison Fraise beacons
export const MAISON_FRAISE_BEACON_UUID = 'E2C56DB5-DFFB-48D2-B060-D0F5A71096E0';

import { DeviceEventEmitter, EmitterSubscription } from 'react-native';

let recommendationRegionSubscription: EmitterSubscription | null = null;

export function startBeaconMonitoring(onEnterRegion: (businessBeaconUUID: string) => void): void {
  Beacons.requestAlwaysAuthorization();
  Beacons.startMonitoringForRegion({
    identifier: 'maison-fraise',
    uuid: MAISON_FRAISE_BEACON_UUID,
  });

  recommendationRegionSubscription = DeviceEventEmitter.addListener('regionDidEnter', (region: any) => {
    const uuid: string = region?.identifier ?? region?.uuid ?? '';
    onEnterRegion(uuid);
  });
}

export function stopBeaconMonitoring(): void {
  if (recommendationRegionSubscription) {
    recommendationRegionSubscription.remove();
    recommendationRegionSubscription = null;
  }
  Beacons.stopMonitoringForRegion({
    identifier: 'maison-fraise',
    uuid: MAISON_FRAISE_BEACON_UUID,
  });
}
