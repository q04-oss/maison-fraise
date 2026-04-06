import { Alert } from 'react-native';
import { getTodayHealthContext } from './HealthKitService';
import { startBeaconMonitoring } from './beaconService';
import { fetchMenuRecommendation } from './api';

// PushNotificationIOS is used if available; Alert.alert is the TestFlight fallback
let PushNotificationIOS: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  PushNotificationIOS = require('@react-native-community/push-notification-ios').default;
} catch {
  // Not available — will fall back to Alert
}

export function initBeaconRecommendations(
  getBusinessByBeaconUUID: (uuid: string) => { id: number; name: string } | null,
): void {
  startBeaconMonitoring(async (businessBeaconUUID: string) => {
    const business = getBusinessByBeaconUUID(businessBeaconUUID);
    if (!business) return;

    try {
      const healthContext = await getTodayHealthContext();
      const recommendations = await fetchMenuRecommendation(business.id, healthContext);

      if (recommendations.length === 0) return;

      const top = recommendations[0];
      const title = `Welcome to ${business.name}`;
      const body = `${top.name} — ${top.reason}`;
      const userInfo = {
        screen: 'partner-detail',
        business_id: business.id,
        recommendation: top,
      };

      if (PushNotificationIOS) {
        PushNotificationIOS.presentLocalNotification({ alertTitle: title, alertBody: body, userInfo });
      } else {
        // TestFlight fallback
        Alert.alert(title, body);
      }
    } catch {
      // Silently fail — recommendation is a nice-to-have
    }
  });
}
