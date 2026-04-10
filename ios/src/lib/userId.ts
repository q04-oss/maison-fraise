import AsyncStorage from '@react-native-async-storage/async-storage';

export async function setVerified(): Promise<void> {
  await AsyncStorage.setItem('verified', 'true');
}
