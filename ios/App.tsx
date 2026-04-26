import React, { createContext, useContext, useState, useEffect } from 'react';
import { View, ActivityIndicator, Platform, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as Notifications from 'expo-notifications';
import { DMMono_400Regular } from '@expo-google-fonts/dm-mono';
import { useFonts } from 'expo-font';
import RootNavigator from './src/navigation/RootNavigator';
import { updatePushToken, getMemberToken } from './src/lib/api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface AppContextType {
  pushToken: string | null;
  pendingScreen: string | null;
  pendingData: Record<string, any> | null;
  clearPendingScreen: () => void;
}

export const AppContext = createContext<AppContextType>({
  pushToken: null,
  pendingScreen: null,
  pendingData: null,
  clearPendingScreen: () => {},
});

export const useApp = () => useContext(AppContext);

export default function App() {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pendingScreen, setPendingScreen] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<Record<string, any> | null>(null);

  const [fontsLoaded] = useFonts({ DMMono_400Regular });

  useEffect(() => {
    registerForPushNotifications().then(token => {
      if (token) setPushToken(token);
    });

    // Tap on notification → navigate
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const screen = response.notification.request.content.data?.screen;
      if (screen === 'my-claims' || screen === 'home') {
        setPendingScreen(screen);
        setPendingData(null);
      }
    });
    return () => sub.remove();
  }, []);

  // Sync push token when app becomes active and member is logged in
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && pushToken) {
        const token = await getMemberToken().catch(() => null);
        if (token) updatePushToken(pushToken).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [pushToken]);

  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#1C1C1E" />
      </View>
    );
  }

  return (
    <AppContext.Provider value={{
      pushToken,
      pendingScreen,
      pendingData,
      clearPendingScreen: () => { setPendingScreen(null); setPendingData(null); },
    }}>
      <StripeProvider publishableKey={publishableKey} merchantIdentifier="merchant.com.boxfraise.app">
        <SafeAreaProvider>
          <RootNavigator />
        </SafeAreaProvider>
      </StripeProvider>
    </AppContext.Provider>
  );
}

async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;
  try {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'ec4ad15d-2535-42a4-91a0-70599925e6f5',
    });
    return token.data;
  } catch {
    return null;
  }
}
