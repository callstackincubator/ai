import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { colors } from '../../../theme/colors'

export function ChatScreenFallback() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={colors.systemBlue as any} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.systemBackground as any,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
