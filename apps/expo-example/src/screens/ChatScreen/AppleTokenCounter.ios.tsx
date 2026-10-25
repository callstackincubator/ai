import { apple, AppleFoundationModels } from '@react-native-ai/apple'
import React, { useEffect, useState } from 'react'
import { StyleSheet, Text } from 'react-native'

import { colors } from '../../theme/colors'

// Used until the model reports its context size, and on iOS versions that do not
const DEFAULT_CONTEXT_WINDOW_TOKENS = 4096
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
  const [contextSize, setContextSize] = useState(DEFAULT_CONTEXT_WINDOW_TOKENS)
  const hasInput = input.trim().length > 0

  useEffect(() => {
    let isActive = true
    apple
      .getModelInfo()
      .then((info) => {
        if (isActive && info.contextSize) setContextSize(info.contextSize)
      })
      .catch(() => {})
    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (!isVisible || !hasInput) {
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
  }, [input, hasInput, isVisible])

  const visibleTokenCount = hasInput ? tokenCount : 0

  if (!isVisible || visibleTokenCount === null) return null

  return (
    <Text style={styles.tokenCounter}>
      {visibleTokenCount}/{contextSize}
    </Text>
  )
}

const styles = StyleSheet.create({
  tokenCounter: {
    color: colors.secondaryLabel as any,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
  },
})
