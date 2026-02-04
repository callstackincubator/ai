import Ionicons from '@expo/vector-icons/Ionicons'
import { SymbolView } from 'expo-symbols'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { AdaptiveGlass } from '../../components/AdaptiveGlass'
import { colors } from '../../theme/colors'

type ModelUnavailableProps = {
  onChooseModel: () => void
}

export function ModelUnavailable({ onChooseModel }: ModelUnavailableProps) {
  return (
    <View style={styles.unavailableContainer}>
      <AdaptiveGlass style={styles.emptyStateIcon}>
        <View style={styles.emptyStateIconInner}>
          <SymbolView
            name="exclamationmark.triangle"
            size={32}
            tintColor={colors.systemYellow}
            resizeMode="scaleAspectFit"
            fallback={
              <Ionicons name="warning" size={32} color={colors.systemYellow} />
            }
          />
        </View>
      </AdaptiveGlass>
      <Text style={styles.emptyStateTitle}>Model Not Available</Text>
      <Text style={styles.emptyStateSubtitle}>
        Selected model is not available on this device. Please choose a
        different one.
      </Text>
      <Pressable onPress={onChooseModel} style={styles.chooseModelButton}>
        <Text style={styles.chooseModelText}>Choose Model</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  unavailableContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyStateIcon: {
    borderRadius: 40,
    overflow: 'hidden',
  },
  emptyStateIconInner: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateTitle: {
    marginTop: 24,
    fontSize: 22,
    fontWeight: '600',
    color: colors.label as any,
  },
  emptyStateSubtitle: {
    marginTop: 8,
    maxWidth: 280,
    textAlign: 'center',
    fontSize: 15,
    color: colors.secondaryLabel as any,
  },
  chooseModelButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: colors.systemBlue as any,
  },
  chooseModelText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
})
