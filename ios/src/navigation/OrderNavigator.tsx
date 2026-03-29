import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OrderStackParamList } from '../types';
import Step1StrawberryScreen from '../screens/order/Step1StrawberryScreen';
import Step2ChocolateScreen from '../screens/order/Step2ChocolateScreen';
import Step3FinishScreen from '../screens/order/Step3FinishScreen';
import Step4QuantityScreen from '../screens/order/Step4QuantityScreen';
import Step5WhereScreen from '../screens/order/Step5WhereScreen';
import Step6WhenScreen from '../screens/order/Step6WhenScreen';
import Step7ReviewScreen from '../screens/order/Step7ReviewScreen';

const Stack = createNativeStackNavigator<OrderStackParamList>();

export default function OrderNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Step1Strawberry" component={Step1StrawberryScreen} />
      <Stack.Screen name="Step2Chocolate" component={Step2ChocolateScreen} />
      <Stack.Screen name="Step3Finish" component={Step3FinishScreen} />
      <Stack.Screen name="Step4Quantity" component={Step4QuantityScreen} />
      <Stack.Screen name="Step5Where" component={Step5WhereScreen} />
      <Stack.Screen name="Step6When" component={Step6WhenScreen} />
      <Stack.Screen name="Step7Review" component={Step7ReviewScreen} />
    </Stack.Navigator>
  );
}
