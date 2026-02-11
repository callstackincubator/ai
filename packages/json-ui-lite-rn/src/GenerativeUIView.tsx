import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { GenUINode } from './GenUINode'
import type { JsonUISpec } from './registry'

export type GenerativeUIViewProps = {
  /** Normalized spec (root + elements with root node "root"). */
  spec: JsonUISpec | null | undefined
  loading?: boolean
  /** Show expandable JSON payload for the current UI spec. */
  showCollapsibleJSON?: boolean
}

export function GenerativeUIView({
  spec,
  loading,
  showCollapsibleJSON,
}: GenerativeUIViewProps) {
  const [expanded, setExpanded] = React.useState(false)
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
      {showCollapsibleJSON ? (
        <View style={styles.jsonPanel}>
          <Pressable
            onPress={() => setExpanded((prev) => !prev)}
            style={styles.jsonHeader}
          >
            <Text style={styles.jsonHeaderText}>UI JSON</Text>
            <Text style={styles.jsonHeaderIcon}>
              {expanded ? '[-]' : '[+]'}
            </Text>
          </Pressable>
          {expanded ? (
            <Text selectable style={styles.jsonText}>
              {JSON.stringify(normalized, null, 2)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  jsonPanel: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f9fafb',
  },
  jsonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  jsonHeaderText: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '600',
  },
  jsonHeaderIcon: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '600',
  },
  jsonText: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#374151',
    fontFamily: 'Menlo',
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
