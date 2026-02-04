import { BlurView } from 'expo-blur'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import React from 'react'
import { StyleSheet, type ViewStyle } from 'react-native'

interface AdaptiveGlassProps {
  children: React.ReactNode
  style?: ViewStyle
  isInteractive?: boolean
}

export function AdaptiveGlass({
  children,
  style,
  isInteractive,
}: AdaptiveGlassProps) {
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView style={style} isInteractive={isInteractive}>
        {children}
      </GlassView>
    )
  }

  return (
    <BlurView
      tint="systemChromeMaterial"
      intensity={100}
      style={[styles.blur, style]}
    >
      {children}
    </BlurView>
  )
}

const styles = StyleSheet.create({
  blur: {
    overflow: 'hidden',
  },
})
