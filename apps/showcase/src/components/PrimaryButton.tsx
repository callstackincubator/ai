import * as Haptics from 'expo-haptics'
import React from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { colors } from '../theme/colors'
import { Glass } from './Glass'

type PrimaryButtonProps = {
  title: string
  onPress: () => void
  disabled?: boolean
}

// A full-width tinted glass button, like the system's prominent glass style
export function PrimaryButton({
  title,
  onPress,
  disabled,
}: PrimaryButtonProps) {
  return (
    <Glass
      isInteractive
      tintColor={disabled ? undefined : '#007AFF'}
      style={[styles.glass, disabled && styles.disabled]}
    >
      <Pressable
        disabled={disabled}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onPress()
        }}
        style={styles.pressable}
      >
        <Text style={[styles.title, disabled && styles.titleDisabled]}>
          {title}
        </Text>
      </Pressable>
    </Glass>
  )
}

const styles = StyleSheet.create({
  glass: {
    borderRadius: 28,
  },
  disabled: {
    opacity: 0.6,
  },
  pressable: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  titleDisabled: {
    color: colors.secondaryLabel,
  },
})
