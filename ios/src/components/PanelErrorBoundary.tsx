import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
}

export default class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Panel error:', error, info);
  }

  reset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong.</Text>
          <TouchableOpacity style={styles.btn} onPress={this.reset} activeOpacity={0.75}>
            <Text style={styles.btnText}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 },
  title: { fontSize: 16, fontFamily: 'DM Sans', color: 'rgba(242,242,247,0.5)', textAlign: 'center', fontStyle: 'italic' },
  btn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20, backgroundColor: 'rgba(201,151,58,0.15)' },
  btnText: { fontSize: 11, fontFamily: 'DM Mono', letterSpacing: 2, color: '#C9973A' },
});
