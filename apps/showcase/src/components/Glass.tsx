import { BlurView } from 'expo-blur'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import React from 'react'
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native'

type GlassProps = {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  isInteractive?: boolean
  tintColor?: string
}

// Liquid glass on iOS 26, a system blur everywhere else
export function Glass({
  children,
  style,
  isInteractive,
  tintColor,
}: GlassProps) {
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        style={style}
        isInteractive={isInteractive}
        tintColor={tintColor}
      >
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
