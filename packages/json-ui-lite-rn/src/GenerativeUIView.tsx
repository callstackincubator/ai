import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { GenUINodeProps } from './GenUINode'
import { GenUINode } from './GenUINode'
import type { GenUIStylesConfig } from './parseGenUIProps'
import { GEN_UI_STYLES, type JsonUISpec } from './registry'

export type GenerativeUIViewProps = {
  /** Normalized spec (root + elements with root node "root"). */
  spec: JsonUISpec | null | undefined
  loading?: boolean
  /** Show expandable JSON payload for the current UI spec. */
  showCollapsibleJSON?: boolean
  /**
   * Override or extend style validators (zod schemas) for node props.
   * Merged with default GEN_UI_STYLES and passed to GenUINode.
   */
  styles?: Partial<typeof GEN_UI_STYLES> & GenUIStylesConfig
  /**
   * Custom node renderer. Receives nodeId, elements, styles (same as default GenUINode).
   * Use for custom component types; delegate to default GenUINode for others.
   */
  GenUINodeComponent?: React.ComponentType<GenUINodeProps>
}

export function GenerativeUIView({
  spec,
  loading,
  showCollapsibleJSON,
  styles: stylesOverride,
  GenUINodeComponent,
}: GenerativeUIViewProps) {
  const [expanded, setExpanded] = React.useState(false)
  const normalized = React.useMemo(() => {
    if (!spec?.root || !spec.elements) return null
    const rootElement = spec.elements[spec.root]
    if (!rootElement) return null
    return spec
  }, [spec])

  const styleValidators: GenUIStylesConfig = React.useMemo(
    () => ({ ...GEN_UI_STYLES, ...stylesOverride }),
    [stylesOverride]
  )

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

  const NodeRenderer = GenUINodeComponent ?? GenUINode
  return (
    <View style={styles.wrapper}>
      <NodeRenderer
        nodeId={normalized.root}
        elements={normalized.elements}
        styles={styleValidators}
        GenUINodeComponent={GenUINodeComponent}
      />
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
