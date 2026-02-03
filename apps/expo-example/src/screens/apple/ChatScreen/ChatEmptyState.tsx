import { SymbolView } from 'expo-symbols'
import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { AdaptiveGlass } from '../../../components/AdaptiveGlass'
import { colors } from '../../../theme/colors'

type ChatEmptyStateProps = {
  title: string
  subtitle: string
}

export function ChatEmptyState({ title, subtitle }: ChatEmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <AdaptiveGlass style={styles.emptyStateIcon}>
        <View style={styles.emptyStateIconInner}>
          <SymbolView
            name="sparkles"
            size={32}
            tintColor={colors.systemBlue}
            resizeMode="scaleAspectFit"
          />
        </View>
      </AdaptiveGlass>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateSubtitle}>{subtitle}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
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
})
