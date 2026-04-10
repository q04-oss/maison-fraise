import { Alert } from 'react-native';
import { getTodayHealthContext } from './HealthKitService';
import { setOnNearbyShop } from './beaconService';
import { fetchMenuRecommendation } from './api';

// PushNotificationIOS is used if available; Alert.alert is the TestFlight fallback
let PushNotificationIOS: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  PushNotificationIOS = require('@react-native-community/push-notification-ios').default;
} catch {
  // Not available — will fall back to Alert
}

// Hooks into the existing beacon monitoring system (loadAndMonitorBeacons).
// Must be called after loadAndMonitorBeacons() has started.
export function initBeaconRecommendations(): void {
  setOnNearbyShop(async (_shopUserId: number, businessName: string, businessId: number) => {
    try {
      const healthContext = await getTodayHealthContext();
      const recommendations = await fetchMenuRecommendation(businessId, healthContext);

      if (recommendations.length === 0) return;

      const top = recommendations[0];
      const title = `Welcome to ${businessName}`;
      const body = `${top.name} — ${top.reason}`;
      const userInfo = {
        screen: 'partner-detail',
        business_id: businessId,
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
