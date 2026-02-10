import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { GenUINode } from './GenUINode'
import type { JsonUISpec } from './registry'

export type GenerativeUIViewProps = {
  /** Normalized spec (root + elements with root node "root"). */
  spec: JsonUISpec | null | undefined
  loading?: boolean
}

export function GenerativeUIView({ spec, loading }: GenerativeUIViewProps) {
  const normalized = React.useMemo(() => {
    if (!spec?.root || !spec.elements) return null
    const rootElement = spec.elements[spec.root]
    if (!rootElement) return null
    return spec
  }, [spec])

  if (!normalized) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          {loading
            ? 'Loading…'
            : 'Use tools getGenUIRootNode, addNode, etc. to build the UI.'}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.wrapper}>
      <GenUINode nodeId={normalized.root} elements={normalized.elements} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  placeholderText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
  },
})
