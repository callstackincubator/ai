import React from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

import type { GenUIStylesConfig } from './parseGenUIProps'
import { parseGenUIElementProps } from './parseGenUIProps'
import { GEN_UI_NODE_NAMES, type JsonUISpec } from './registry'

export type GenUINodeProps = {
  nodeId: string
  elements: JsonUISpec['elements']
  styles: GenUIStylesConfig
  /** When provided by GenerativeUIView, used to render children so custom types are handled at any depth. */
  GenUINodeComponent?: React.ComponentType<GenUINodeProps>
}

export function GenUINode({
  nodeId,
  elements,
  styles: styleValidators,
  GenUINodeComponent,
}: GenUINodeProps) {
  const element = elements[nodeId]
  if (!element) return null

  const { type, props, children = [] } = element
  const { baseStyle, text, label } = parseGenUIElementProps(
    element,
    styleValidators,
    { nodeId, type }
  )

  const ChildRenderer = GenUINodeComponent ?? GenUINode
  const childProps: Omit<GenUINodeProps, 'nodeId'> = {
    elements,
    styles: styleValidators,
    GenUINodeComponent,
  }

  switch (type) {
    case 'Container':
      return (
        <View style={[styles.container, baseStyle]}>
          {children.map((id) => (
            <ChildRenderer key={id} {...childProps} nodeId={id} />
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
            <ChildRenderer key={id} {...childProps} nodeId={id} />
          ))}
        </View>
      )
  }
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    flex: 1,
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
