# Generative UI View

`GenerativeUIView` renders a JSON UI spec in React Native. The default node renderer (`GenUINode`) receives style validators from the view; you can override styles or supply a custom renderer.

For a full usage example, see [this file](https://github.com/callstackincubator/ai/tree/main/generative-ui/apps/expo-example/src/screens/ChatScreen/ChatMessages.tsx).

## Basic usage

```tsx
import { GenerativeUIView } from '@react-native-ai/json-ui'
;<GenerativeUIView spec={spec} loading={isGenerating} />
```

## Props

| Prop                  | Type                                         | Description                                                                                                                                        |
| --------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spec`                | `{ root, elements }` or `null` / `undefined` | The UI spec to render                                                                                                                              |
| `loading`             | `boolean`                                    | Optional; shows loading placeholder when truthy and spec is empty                                                                                  |
| `showCollapsibleJSON` | `boolean`                                    | Optional; shows an expandable JSON debug panel                                                                                                     |
| `styles`              | object                                       | Optional; merged with default `GEN_UI_STYLES` and passed to `GenUINode`                                                                            |
| `GenUINodeComponent`  | component                                    | Optional; custom component to render the tree; receives `{ nodeId, elements, styles }`; delegate to default `GenUINode` for nodes you don’t handle |

## Styles from GenerativeUIView

The default `GenUINode` does not import `GEN_UI_STYLES` itself. `GenerativeUIView` merges the registry default with any `styles` prop and passes the result down as the `styles` prop to `GenUINode`. All style validation is driven by what the view provides, so you can pass custom validators:

```tsx
import { z } from 'zod'
import { GenerativeUIView, GEN_UI_STYLES } from '@react-native-ai/json-ui'
;<GenerativeUIView
  spec={spec}
  styles={{
    ...GEN_UI_STYLES,
    borderRadius: z.number(),
  }}
/>
```

## Custom GenUINode

You can supply your own node renderer and reuse the library’s style/prop parsing via `parseGenUIElementProps`. For one type render a custom component; for everything else use the default `GenUINode`. Pass `GenUINodeComponent` through so custom types work at any depth.

Example: custom `Badge` type, default renderer for the rest.

```tsx
import { View, Text, StyleSheet } from 'react-native'
import {
  GenerativeUIView,
  GenUINode,
  parseGenUIElementProps,
  type GenUINodeProps,
} from '@react-native-ai/json-ui'

const BADGE_TYPE = 'Badge'

function CustomGenUINode({
  nodeId,
  elements,
  styles,
}: GenUINodeProps) {
  const element = elements[nodeId]
  if (!element) return null
  if (element.type === BADGE_TYPE) {
    const { baseStyle, text } = parseGenUIElementProps(element, styles, {
      nodeId,
      type: BADGE_TYPE,
    })
    return (
      <View style={[customStyles.badge, baseStyle]}>
        <Text style={customStyles.badgeText}>{text ?? ''}</Text>
      </View>
    )
  }
  return (
    <GenUINode
      nodeId={nodeId}
      elements={elements}
      styles={styles}
      GenUINodeComponent={CustomGenUINode}
    />
  )
}

const customStyles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { fontSize: 12, color: '#fff' },
})

// Use the custom renderer; styles still come from the view (default or overridden).
<GenerativeUIView spec={spec} GenUINodeComponent={CustomGenUINode} />
```

`parseGenUIElementProps(element, styleValidators, options?)` returns `{ baseStyle, text, label, props }` and runs the same validation and prop parsing as the default renderer. Use it for custom node types that should respect the same style schema.
