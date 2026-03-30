import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchLocations } from '../../lib/api';
import { useOrder } from '../../context/OrderContext';
import { COLORS, SPACING } from '../../theme';
import { OrderStackParamList } from '../../types';
import StepLayout from '../../components/StepLayout';

type Nav = NativeStackNavigationProp<OrderStackParamList, 'Step5Where'>;

export default function Step5WhereScreen() {
  const navigation = useNavigation<Nav>();
  const { order, setLocation } = useOrder();
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLocations()
      .then(setLocations)
      .catch(() => setLocations([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <StepLayout
      step={5}
      title="Where"
      onBack={() => navigation.goBack()}
      onContinue={() => navigation.navigate('Step6When')}
      continueLabel="Continue to When"
      canContinue={!!order.location_id}
    >
      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator color={COLORS.forestGreen} />
        ) : (
          locations.map((loc) => {
            const selected = order.location_id === loc.id;
            return (
              <TouchableOpacity
                key={loc.id}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => setLocation(loc.id, loc.name)}
                activeOpacity={0.85}
              >
                <Text style={[styles.optionName, selected && styles.textWhite]}>
                  {loc.name}
                </Text>
                {loc.detail && (
                  <Text style={[styles.optionDetail, selected && styles.textWhiteMuted]}>
                    {loc.detail}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  container: { padding: SPACING.md, gap: SPACING.sm },
  option: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    gap: 4,
  },
  optionSelected: { ba