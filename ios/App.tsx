import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_400Regular_Italic,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import { OrderProvider } from './src/context/OrderContext';
import BottomTabNavigator from './src/navigation/BottomTabNavigator';
import { COLORS } from './src/theme';
import { enableReviewMode as activateReviewMode } from './src/lib/reviewMode';

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

  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    PlayfairDisplay_700Bold,
  });

  useEffect(() => {
    registerForPushNotifications().then(token => {
      if (token) setPushToken(token);
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // notification received while app is foregrounded — handler above shows it
    });

    return () => {
      notificationListener.current?.remove();
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
          <StatusBar style="light" />
          <OrderProvider>
            <NavigationContainer>
              <BottomTabNavigator />
            </NavigationContainer>
          </OrderProvider>
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
