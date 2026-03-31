import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { NavigationContainerRef } from '@react-navigation/native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import { DMMono_400Regular } from '@expo-google-fonts/dm-mono';
import RootNavigator from './src/navigation/RootNavigator';
import { COLORS } from './src/theme';
import { enableReviewMode as activateReviewMode } from './src/lib/reviewMode';
import { getUserId } from './src/lib/userId';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface AppContextType {
  reviewMode: boolean;
  enableReviewMode: () => void;
  pushToken: string | null;
}

export const AppContext = createContext<AppContextType>({
  reviewMode: false,
  enableReviewMode: () => {},
  pushToken: null,
});

export const useApp = () => useContext(AppContext);

export default function App() {
  const [reviewMode, setReviewMode] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const navigationRef = useRef<NavigationContainerRef<any>>(null);

  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMMono_400Regular,
  });

  useEffect(() => {
    // Initialize user ID on first launch
    getUserId().catch(() => {});

    registerForPushNotifications().then(token => {
      if (token) setPushToken(token);
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // notification received while foregrounded — handler above shows it
    });

    // Navigate to NFCVerify when geofence notification is tapped
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const screen = response.notification.request.content.data?.screen;
      if (screen === 'NFCVerify') {
        navigationRef.current?.navigate('Main');
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
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
      <View style={{ flex: 1, backgroundColor: COLORS.forestGreen, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.cream} />
      </View>
    );
  }

  return (
    <AppContext.Provider value={{ reviewMode, enableReviewMode: handleEnableReviewMode, pushToken }}>
      <StripeProvider key={reviewMode ? 'test' : 'live'} publishableKey={publishableKey} merchantIdentifier="merchant.com.maisonfraise">
        <SafeAreaProvider>
          <NavigationContainer ref={navigationRef}>
            <RootNavigator />
          </NavigationContainer>
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

  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
}
