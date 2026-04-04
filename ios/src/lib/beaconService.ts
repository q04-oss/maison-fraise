import { Platform } from 'react-native';
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
    Beacons.BeaconsEventEmitter.addListener('regionDidEnter', async (region: any) => {
      const match = knownBeacons.find(b => b.uuid.toLowerCase() === region.uuid?.toLowerCase());
      if (!match) return;

      const shopUser = await fetchBeaconShopUser(match.business_id).catch(() => null);
      if (!shopUser) return;

      if (onNearbyShop) {
        onNearbyShop(shopUser.id, match.business_name, match.business_id);
      } else {
        // App is in background — send local notification
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
  for (const beacon of knownBeacons) {
    Beacons.stopMonitoringForRegion({ identifier: beacon.uuid, uuid: beacon.uuid });
    Beacons.stopRangingBeaconsInRegion({ identifier: beacon.uuid, uuid: beacon.uuid });
  }
  monitoring = false;
}
