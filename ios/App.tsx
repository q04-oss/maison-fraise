import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { View, ActivityIndicator, Platform, StatusBar, AppState, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans';
import { DMMono_400Regular } from '@expo-google-fonts/dm-mono';
import RootNavigator from './src/navigation/RootNavigator';
import { updatePushToken } from './src/lib/api';
import './src/lib/geofence'; // registers background geofence task at startup

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface IncomingBanner {
  senderName: string;
  body: string;
  userId: number;
}

interface AppContextType {
  pushToken: string | null;
  pendingScreen: string | null;
  pendingData: Record<string, any> | null;
  clearPendingScreen: () => void;
  connectReturn: boolean;
  clearConnectReturn: () => void;
  unreadCount: number;
  refreshUnreadCount: () => void;
  incomingBanner: IncomingBanner | null;
  clearIncomingBanner: () => void;
}

export const AppContext = createContext<AppContextType>({
  pushToken: null,
  pendingScreen: null,
  pendingData: null,
  clearPendingScreen: () => {},
  connectReturn: false,
  clearConnectReturn: () => {},
  unreadCount: 0,
  refreshUnreadCount: () => {},
  incomingBanner: null,
  clearIncomingBanner: () => {},
});

export const useApp = () => useContext(AppContext);

export default function App() {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pendingScreen, setPendingScreen] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<Record<string, any> | null>(null);
  const [connectReturn, setConnectReturn] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [incomingBanner, setIncomingBanner] = useState<IncomingBanner | null>(null);
  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_700Bold,
    DMSans_400Regular,
    DMMono_400Regular,
  });

  const refreshUnreadCount = useCallback(async () => {
    const id = await AsyncStorage.getItem('user_db_id').catch(() => null);
    if (!id) return;
    try {
      const { fetchConversations } = await import('./src/lib/api');
      const convos = await fetchConversations();
      const total = convos.reduce((n: number, c: any) => n + (c.unread_count ?? 0), 0);
      setUnreadCount(total);
    } catch { /* non-fatal */ }
  }, []);

  // Initialise E2E keys after session is available
  useEffect(() => {
    AsyncStorage.getItem('user_db_id').then(id => {
      if (id) import('./src/lib/crypto').then(({ initKeys }) => initKeys()).catch(() => {});
    });
  }, []);

  useEffect(() => {
    registerForPushNotifications().then(token => {
      if (token) setPushToken(token);
    });

    // Poll unread count every 30s
    refreshUnreadCount();
    const pollInterval = setInterval(refreshUnreadCount, 30000);

    // Foreground notification: show in-app banner for message pushes
    const foregroundSub = Notifications.addNotificationReceivedListener(notification => {
      const screen = notification.request.content.data?.screen;
      if (screen === 'messages') {
        const userId = notification.request.content.data?.user_id;
        const senderName = notification.request.content.title ?? 'New message';
        const body = notification.request.content.body ?? '';
        if (userId) {
          setIncomingBanner({ senderName, body, userId: Number(userId) });
        }
        refreshUnreadCount();
      }
    });

    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const screen = response.notification.request.content.data?.screen;
      if (screen === 'order-history') {
        setPendingScreen('order-history');
      }
      if (screen === 'profile') {
        setPendingScreen('profile');
      }
      if (screen === 'messages') {
        const userId = response.notification.request.content.data?.user_id;
        setPendingScreen('messages');
        setPendingData(userId ? { user_id: userId } : null);
      }
      if (screen === 'tokens') {
        const tokenId = response.notification.request.content.data?.token_id;
        setPendingScreen('tokens');
        setPendingData(tokenId ? { token_id: tokenId } : null);
      }
      if (screen === 'token-offer') {
        setPendingScreen('token-offer');
        setPendingData(null);
      }
      if (screen === 'tournaments') {
        const tournamentId = response.notification.request.content.data?.tournament_id;
        setPendingScreen('tournaments');
        setPendingData(tournamentId ? { tournament_id: tournamentId } : null);
      }
    });
    return () => {
      sub.remove();
      foregroundSub.remove();
      clearInterval(pollInterval);
    };
  }, []);

  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (url.startsWith('fraise://connect-return')) {
        setConnectReturn(true);
      }
    };
    const sub = Linking.addEventListener('url', handleUrl);
    // Check if app was cold-launched from the return URL
    Linking.getInitialURL().then(url => {
      if (url?.startsWith('fraise://connect-return')) setConnectReturn(true);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && pushToken) {
        const id = await AsyncStorage.getItem('user_db_id').catch(() => null);
        if (id) updatePushToken(pushToken).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [pushToken]);

  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F7F5F2', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#C9973A" />
      </View>
    );
  }

  return (
    <AppContext.Provider value={{ pushToken, pendingScreen, pendingData, clearPendingScreen: () => { setPendingScreen(null); setPendingData(null); }, connectReturn, clearConnectReturn: () => setConnectReturn(false), unreadCount, refreshUnreadCount, incomingBanner, clearIncomingBanner: () => setIncomingBanner(null) }}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
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

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
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

// @final-audit
