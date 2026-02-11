# `@react-native-ai/json-ui`

Lightweight JSON UI tooling for React Native + Vercel AI SDK tool calling.

**This package provides:**

- a component/style registry (`GEN_UI_NODE_HINTS`, `GEN_UI_STYLES`, `GEN_UI_NODE_NAMES`)
- a ready-to-use tool set for JSON UI mutation (`createGenUITools`)
- a reusable system prompt builder (`buildGenUISystemPrompt`)
- a React Native renderer for specs (`GenerativeUIView`), which passes `GEN_UI_STYLES` (overridable) to the default `GenUINode` and lets you supply a custom node renderer

**Why this package?**

There exists a great library for streaming interfaces: [`json-render`](https://github.com/vercel-labs/json-render). The full specification is provided in the ['Prior art'](#prior-art) section, but **TL;DR**: this library - `@react-native-ai/json-ui` - is the choice for small language models (e.g. parameters in the order of magnitude of 3B), which is usually the case if you are running inference locally, on-device. If you are using a cloud provider, consider `json-render` instead.

## Requirements

- React Native app
- Vercel AI SDK tool-calling flow (`streamText`, `generateText`, etc.)
- model that supports tool calling

## Installation

```sh
bun add @react-native-ai/json-ui
```

## Quick Start

```ts
import { streamText } from 'ai'
import {
  buildGenUISystemPrompt,
  createGenUITools,
} from '@react-native-ai/json-ui'

const tools = createGenUITools({
  contextId: chatId,
  getSpec: (id) => getSpecForChat(id),
  updateSpec: (id, nextSpec) => setSpecForChat(id, nextSpec),
  toolWrapper: (toolName, execute) => async (args) => {
    console.log('Executing tool', toolName, args)
    return execute(args)
  },
})

const result = streamText({
  model,
  messages,
  tools,
  system: buildGenUISystemPrompt({
    additionalInstructions:
      'Your name is John. Keep responses short. Ask follow-up questions when UI intent is unclear.',
  }),
})
```

## API

### `createGenUITools(options)`

Creates a set of tool definitions:

- `getUIRootNode`
- `getUINode`
- `getUILayout`
- `getAvailableUINodes`
- `setUINodeProps`
- `deleteUINode`
- `addUINode`
- `reorderUINodes`

`reorderUINodes` moves one sibling by index offset (with clamping):

- `nodeId`: node to move
- `offset`: integer shift among siblings (`< 0` moves earlier, `> 0` moves later)

Options:

- `contextId`: string key for your current conversation/context
- `getSpec(contextId)`: return current spec (or `null`)
- `updateSpec(contextId, spec)`: persist changes
- `createId`: optional id factory
- `rootId`: optional root id override (default: `"root"`)
- `nodeHints`: optional component registry override
- `nodeNamesThatSupportChildren`: optional parent whitelist override
- `toolWrapper(toolName, execute)`: required wrapper used to decorate all tool executions (for logging, error handling, telemetry, etc.)

Tool behavior details:

- `setUINodeProps`: `{ id, props, replace? }`; defaults to merge mode, set `replace: true` to replace all props
- `addUINode`: `{ parentId?, type, props? }`; if `parentId` is omitted it defaults to root
- `reorderUINodes`: clamps index movement to valid sibling bounds

### `buildGenUISystemPrompt(options?)`

Builds the reusable, non-app-specific system instructions for JSON UI tooling.

Options:

- `additionalInstructions`: append app-specific guidance
- `requireLayoutReadBeforeAddingNodes`: defaults to `true`
- `styleHints`: override style metadata used in prompt text

### Registries

- `GEN_UI_NODE_NAMES`
- `GEN_UI_NODE_HINTS`
- `GEN_UI_NODE_NAMES_THAT_SUPPORT_CHILDREN`
- `GEN_UI_STYLES`
- `GEN_UI_STYLE_HINTS`

### `GenerativeUIView`

Renders a JSON UI spec directly in React Native. The default node renderer (`GenUINode`) receives style validators from the view; you can override styles or supply a custom renderer.

```tsx
import { GenerativeUIView } from '@react-native-ai/json-ui'
;<GenerativeUIView spec={spec} loading={isGenerating} />
```

Props:

- `spec`: `{ root, elements }` object (or `null`/`undefined`)
- `loading`: optional boolean for empty-state loading text
- `showCollapsibleJSON`: optional boolean to render an expandable JSON debug panel
- `styles`: optional override for style validators (merged with default `GEN_UI_STYLES`); the resulting map is passed to `GenUINode`
- `GenUINodeComponent`: optional custom component to render the tree; receives `{ nodeId, elements, styles }`; delegate to default `GenUINode` for nodes you don’t handle

#### Styles from GenerativeUIView

The default `GenUINode` does not import `GEN_UI_STYLES` itself. `GenerativeUIView` merges the registry default with any `styles` prop and passes the result down as the `styles` prop to `GenUINode`. So all style validation is driven by what the view provides, and you can pass custom validators:

```tsx
import { z } from 'zod'
import { GenerativeUIView, GEN_UI_STYLES } from '@react-native-ai/json-ui'
;<GenerativeUIView
  spec={spec}
  styles={{
    borderRadius: z.number(),
  }}
/>
```

#### Custom GenUINode example

You can supply your own node renderer and reuse the library’s style/prop parsing for custom component types. For one type render a custom component using `parseGenUIElementProps`; for everything else use the default `GenUINode`:

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
  GenUINodeComponent,
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
      GenUINodeComponent={GenUINodeComponent}
    />
  )
}

const customStyles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, color: '#fff' },
})

// Use the custom renderer; styles still come from the view (default or overridden).
<GenerativeUIView spec={spec} GenUINodeComponent={CustomGenUINode} />
```

For a full usage example, see [this file](https://github.com/callstackincubator/ai/tree/main/generative-ui/apps/expo-example/src/store/chatStore.ts).

## Notes

- style validation is schema-based (`zod`) through `GEN_UI_STYLES`
- tools are framework-agnostic as long as your spec matches `{ root, elements }`
- this package is intentionally minimal and optimized for small-model tool loops

## Prior art

[`json-render`](https://github.com/vercel-labs/json-render) is an alternative that has existed before this library was introduced.
It provides a package both for React and React Native integration and is also compatible with the [AI SDK](https://github.com/vercel/ai). Its design involves two primary concepts:

- the LLM streams the UI directly in a predefined format and all outputs are intercepted by the stream parser
- the library provides a (long) system prompt which well describes that format for the LLM to follow, along with examples

That works well for **large language models** (e.g. cloud APIs). For **on-device, small models** (e.g. Apple Foundation Models with limited context), you run into:

1. **Context size** — Small models often have 4K-token windows (such as Apple Foundation having a 4096 token limit). A long system prompt plus conversation leaves little room; you end up summarizing or truncating, if you even fit into the window at all.
2. **Task complexity** — json-render supports rich actions and state. For small models (e.g. 3B parameters), generating a correct static UI is already hard; a simpler, tool-based flow is more reliable.

How this library differs is:

- **Tool calling instead of streaming UI** — The model emits small JSON payloads by calling tools (add node, set props, etc.). Each step is small and easier for the model to get right.
- **Narrower feature set** — Focus on static UI building first, so smaller models can complete the task. More features will be added later.

## License

MIT
