import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';

const NetworkInfo = () => {
  const netInfo = useNetInfo();

  const getStatusColor = () => {
    if (netInfo.isConnected) return styles.connected;
    return styles.disconnected;
  };

  return (
    <View style={styles.container}>
      <View style={[styles.statusIndicator, getStatusColor()]} />
      <Text style={styles.text}>
        {netInfo.isConnected 
          ? `Connected via ${netInfo.type} ${netInfo.isInternetReachable ? '✅' : '⚠️'}`
          : 'No network connection ❌'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  connected: {
    backgroundColor: '#4CAF50',
  },
  disconnected: {
    backgroundColor: '#F44336',
  },
  textContainer: {
    flex: 1,
  },
  text: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },
});

export default NetworkInfo;
