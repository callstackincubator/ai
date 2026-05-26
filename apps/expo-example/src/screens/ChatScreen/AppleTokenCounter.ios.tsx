import { AppleFoundationModels } from '@react-native-ai/apple'
import React, { useEffect, useState } from 'react'
import { StyleSheet, Text } from 'react-native'

import { colors } from '../../theme/colors'

const APPLE_CONTEXT_WINDOW_TOKENS = 4096
const TOKEN_COUNT_DEBOUNCE_MS = 250

type AppleTokenCounterProps = {
  input: string
  isVisible: boolean
}

export function AppleTokenCounter({
  input,
  isVisible,
}: AppleTokenCounterProps) {
  const [tokenCount, setTokenCount] = useState<number | null>(0)

  useEffect(() => {
    if (!isVisible) {
      setTokenCount(null)
      return
    }

    if (!input.trim()) {
      setTokenCount(0)
      return
    }

    let isActive = true
    const timeoutId = setTimeout(() => {
      AppleFoundationModels.countTokens(input)
        .then((count) => {
          if (isActive) setTokenCount(count)
        })
        .catch(() => {
          if (isActive) setTokenCount(null)
        })
    }, TOKEN_COUNT_DEBOUNCE_MS)

    return () => {
      isActive = false
      clearTimeout(timeoutId)
    }
  }, [input, isVisible])

  if (!isVisible || tokenCount === null) return null

  return (
    <Text style={styles.tokenCounter}>
      {tokenCount}/{APPLE_CONTEXT_WINDOW_TOKENS}
    </Text>
  )
}

const styles = StyleSheet.create({
  tokenCounter: {
    color: colors.secondaryLabel as any,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'right',
    marginBottom: 6,
  },
})
