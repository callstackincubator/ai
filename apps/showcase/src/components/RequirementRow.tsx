import { SymbolView, type SymbolViewProps } from 'expo-symbols'
import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { colors } from '../theme/colors'

type RequirementRowProps = {
  symbol: SymbolViewProps['name']
  title: string
  subtitle: string
  state: 'ready' | 'action' | 'working' | 'unavailable'
  // Shown as a button when the state is 'action'
  actionTitle?: string
  onAction?: () => void
  // 0 to 100 while working, omitted for an indeterminate spinner
  progress?: number
}

export function RequirementRow({
  symbol,
  title,
  subtitle,
  state,
  actionTitle,
  onAction,
  progress,
}: RequirementRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <SymbolView name={symbol} size={22} tintColor={colors.systemBlue} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {state === 'working' && progress !== undefined && (
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${progress}%` }]} />
          </View>
        )}
      </View>
      {state === 'ready' && (
        <SymbolView
          name="checkmark.circle.fill"
          size={24}
          tintColor={colors.systemGreen}
        />
      )}
      {state === 'unavailable' && (
        <SymbolView
          name="xmark.circle.fill"
          size={24}
          tintColor={colors.tertiaryLabel}
        />
      )}
      {state === 'working' && progress === undefined && <ActivityIndicator />}
      {state === 'working' && progress !== undefined && (
        <Text style={styles.percent}>{progress}%</Text>
      )}
      {state === 'action' && (
        <Pressable onPress={onAction} style={styles.action} hitSlop={8}>
          <Text style={styles.actionTitle}>{actionTitle}</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tertiarySystemFill,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.label,
  },
  subtitle: {
    fontSize: 14,
    color: colors.secondaryLabel,
  },
  track: {
    marginTop: 6,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.tertiarySystemFill,
  },
  bar: {
    height: 4,
    backgroundColor: colors.systemBlue,
  },
  percent: {
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    color: colors.secondaryLabel,
  },
  action: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.tertiarySystemFill,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.systemBlue,
  },
})
