import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';

export const GEOFENCE_TASK = 'mf-geofence';

interface GeofenceLocation {
  id: string | number;
  name: string;
  lat: number;
  lng: number;
}

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody) => {
  if (error) return;

  const { eventType, region } = data as {
    eventType: Location.GeofencingEventType;
    region: Location.LocationRegion;
  };

  if (eventType === Location.GeofencingEventType.Enter) {
    Notifications.scheduleNotificationAsync({
      content: {
        title: 'You\'re nearby.',
        body: 'Open the box and tap your phone to the NFC chip inside the lid.',
        data: { screen: 'NFCVerify' },
      },
      trigger: null,
    }).catch(() => {});
  }
});

export async function registerGeofences(locations: GeofenceLocation[]): Promise<void> {
  const { status } = await Location.getBackgroundPermissionsAsync();
  if (status !== 'granted') return;

  const regions: Location.LocationRegion[] = locations.map(loc => ({
    identifier: String(loc.id),
    latitude: loc.lat,
    longitude: loc.lng,
    radius: 100,
    notifyOnEnter: true,
    notifyOnExit: false,
  }));

  await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
}
