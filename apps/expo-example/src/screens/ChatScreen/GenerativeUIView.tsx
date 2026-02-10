import React from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import type { ChatUISpec } from '../../store/chatStore'
import { GEN_UI_NODE_NAMES, GEN_UI_STYLES } from '../../ui/genUiNodes'

type GenerativeUIViewProps = {
  /** Normalized spec (root + elements with root node "root"). */
  spec: ChatUISpec | null | undefined
  loading?: boolean
}

function GenUINode({
  nodeId,
  elements,
}: {
  nodeId: string
  elements: Record<
    string,
    { type: string; props: Record<string, unknown>; children?: string[] }
  >
}) {
  const el = elements[nodeId]
  if (!el) return null

  const { type, props, children = [] } = el
  const style = props?.style as Record<string, unknown> | undefined
  const flex = props?.flex as number | undefined
  const padding = props?.padding as number | undefined
  const gap = props?.gap as number | undefined
  const text = (props?.text ?? props?.value ?? props?.label) as
    | string
    | undefined
  const label = (props?.label ?? props?.text) as string | undefined

  const baseStyle = {
    ...(flex != null ? { flex } : {}),
    ...(padding != null ? { padding } : {}),
    ...(gap != null ? { gap } : {}),
    ...style,
  } as Record<string, unknown>

  for (const key of Object.keys(props)) {
    const validator = GEN_UI_STYLES[key as keyof typeof GEN_UI_STYLES]
    if (validator) {
      if (validator.safeParse(props[key]).success) {
        baseStyle[key] = props[key]
      } else {
        console.warn(
          `Invalid style prop: ${key} for node ${nodeId} of type ${type}: ${props[key]}`
        )
      }
    }
  }

  switch (type) {
    case 'Container':
      return (
        <View style={[styles.container, baseStyle]}>
          {children.map((id) => (
            <GenUINode key={id} nodeId={id} elements={elements} />
          ))}
        </View>
      )

    case GEN_UI_NODE_NAMES.Text:
    case GEN_UI_NODE_NAMES.Paragraph:
    case GEN_UI_NODE_NAMES.Label:
    case GEN_UI_NODE_NAMES.Heading:
      return <Text style={[styles.text, baseStyle]}>{text ?? label ?? ''}</Text>

    case GEN_UI_NODE_NAMES.Button:
      return (
        <Pressable style={[styles.button, baseStyle]}>
          <Text style={[styles.buttonText, baseStyle]}>
            {label ?? text ?? ''}
          </Text>
        </Pressable>
      )

    case GEN_UI_NODE_NAMES.TextInput:
      return (
        <TextInput
          placeholder={props?.placeholder as string}
          style={[styles.textInput, baseStyle]}
          onChangeText={() => {}}
        />
      )

    default:
      return (
        <View style={[styles.container, baseStyle]}>
          {children.map((id) => (
            <GenUINode key={id} nodeId={id} elements={elements} />
          ))}
        </View>
      )
  }
}

export function GenerativeUIView({ spec, loading }: GenerativeUIViewProps) {
  const normalized = React.useMemo(() => {
    if (!spec?.root || !spec.elements) return null
    const rootEl = spec.elements[spec.root]
    if (!rootEl) return null
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
  container: {
    gap: 8,
    flex: 1,
  },
  column: {
    flexDirection: 'column',
    gap: 8,
  },
  text: {
    fontSize: 16,
    color: '#111827',
    flex: 1,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    alignSelf: 'flex-start',
    flex: 1,
  },
  buttonText: {
    flex: 1,
    color: 'white',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 8,
    fontSize: 16,
    color: '#111827',
    flex: 1,
  },
})
