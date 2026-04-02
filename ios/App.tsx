import React, { createContext, useContext, useState, useEffect } from 'react';
import { View, ActivityIndicator, Platform, StatusBar } from 'react-native';
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
import OnboardingScreen from './src/screens/OnboardingScreen';
import { enableReviewMode as activateReviewMode } from './src/lib/reviewMode';
import './src/lib/geofence'; // registers background geofence task at startup

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface AppContextType {
  reviewMode: boolean;
  enableReviewMode: () => void;
  pushToken: string | null;
  pendingScreen: string | null;
  pendingData: Record<string, any> | null;
  clearPendingScreen: () => void;
}

export const AppContext = createContext<AppContextType>({
  reviewMode: false,
  enableReviewMode: () => {},
  pushToken: null,
  pendingScreen: null,
  pendingData: null,
  clearPendingScreen: () => {},
});

export const useApp = () => useContext(AppContext);

export default function App() {
  const [reviewMode, setReviewMode] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pendingScreen, setPendingScreen] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<Record<string, any> | null>(null);
  const [onboardingDone, setOnboardingDone] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_700Bold,
    DMSans_400Regular,
    DMMono_400Regular,
  });

  useEffect(() => {
    AsyncStorage.getItem('onboarding_done').then(v => {
      if (v === '1') setOnboardingDone(true);
    }).catch(() => {});

    registerForPushNotifications().then(token => {
      if (token) setPushToken(token);
    });

    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const screen = response.notification.request.content.data?.screen;
      if (screen === 'NFCVerify') setPendingScreen('nfc');
      if (screen === 'popup') setPendingScreen('popup');
      if (screen === 'dj_offer') {
        const popupId = response.notification.request.content.data?.popup_id;
        if (popupId) { setPendingData({ popup_id: popupId }); setPendingScreen('dj-offer'); }
      }
      if (screen === 'nominate') {
        const popupId = response.notification.request.content.data?.popup_id;
        if (popupId) { setPendingData({ popup_id: popupId }); setPendingScreen('nomination'); }
      }
      if (screen === 'audition_result') {
        const popupId = response.notification.request.content.data?.popup_id;
        if (popupId) { setPendingData({ popup_id: popupId }); setPendingScreen('audition-result'); }
      }
      if (screen === 'campaign_commission') {
        const popupId = response.notification.request.content.data?.popup_id;
        if (popupId) { setPendingData({ popup_id: popupId }); setPendingScreen('campaign-commission'); }
      }
      if (screen === 'contract_offer') {
        setPendingScreen('contract-offer');
      }
    });
    return () => sub.remove();
  }, []);

  const handleEnableReviewMode = () => {
    activateReviewMode();
    setReviewMode(true);
  };

  const publishableKey = reviewMode
    ? (process.env.EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY ?? '')
    : (process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '');

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F7F5F2', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#C9973A" />
      </View>
    );
  }

  if (!onboardingDone) {
    return (
      <SafeAreaProvider>
        <OnboardingScreen onDone={() => setOnboardingDone(true)} />
      </SafeAreaProvider>
    );
  }

  return (
    <AppContext.Provider value={{ reviewMode, enableReviewMode: handleEnableReviewMode, pushToken, pendingScreen, pendingData, clearPendingScreen: () => { setPendingScreen(null); setPendingData(null); } }}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <StripeProvider key={reviewMode ? 'test' : 'live'} publishableKey={publishableKey} merchantIdentifier="merchant.com.maisonfraise.app">
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
