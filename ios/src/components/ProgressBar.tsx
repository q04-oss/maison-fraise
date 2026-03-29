import React from 'react';
import { View, StyleSheet } from 'react-native';

interface Props {
  current: number;
  total: number;
}

const ProgressBar: React.FC<Props> = ({ current, total }) => {
  return (
    <View style={styles.container}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[styles.segment, i < current ? styles.filled : styles.empty]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  segment: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
  filled: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  empty: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
});

export default ProgressBar;
