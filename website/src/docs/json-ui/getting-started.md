# Getting Started

Lightweight JSON UI tooling for React Native with the Vercel AI SDK. The model builds and updates a UI by calling tools (e.g. add node, set props); you render the resulting spec with `GenerativeUIView`.

## What this package provides

- **Component/style registry** — `GEN_UI_NODE_HINTS`, `GEN_UI_STYLES`, `GEN_UI_NODE_NAMES` for tools and prompts
- **Tool set** — `createGenUITools` for JSON UI mutation (get/add/delete nodes, set props, reorder)
- **System prompt** — `buildGenUISystemPrompt` for model instructions
- **Renderer** — `GenerativeUIView` passes `GEN_UI_STYLES` (overridable) to the default `GenUINode` and supports a custom node renderer

## Why this package?

There exists a great library for streaming interfaces: [`json-render`](https://github.com/vercel-labs/json-render). The full specification is provided in the ['Prior art'](./prior-art.md) section, but **TL;DR**: this library - `@react-native-ai/json-ui` - is the choice for small language models (e.g. parameters in the order of magnitude of 3B), which is usually the case if you are running inference locally, on-device. If you are using a cloud provider, consider `json-render` instead.

## Requirements

- React Native app
- Vercel AI SDK tool-calling flow (`streamText`, `generateText`, etc.)
- A model that supports tool calling

## Installation

```bash
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

Finally, render the spec set by `updateSpec` in your app with `GenerativeUIView` (see [Generative UI View](./view.md)):

```tsx
<GenerativeUIView spec={getChatUISpecFromChats(chatId)} />
```

For a full usage example, see [this file](https://github.com/callstackincubator/ai/tree/main/generative-ui/apps/expo-example/src/store/chatStore.ts).

## Registries

The package exports these registry constants (used by tools and the default renderer):

- `GEN_UI_NODE_NAMES` — canonical node type names (Text, Paragraph, Label, Heading, Button, TextInput)
- `GEN_UI_NODE_HINTS` — short descriptions for each node type (for prompts)
- `GEN_UI_NODE_NAMES_THAT_SUPPORT_CHILDREN` — node types that can have children
- `GEN_UI_STYLES` — zod schemas for style props (flex, padding, gap, backgroundColor, color, etc.)
- `GEN_UI_STYLE_HINTS` — metadata for style keys (for prompt text)

## Notes

- Style validation is schema-based (zod) via `GEN_UI_STYLES`.
- The package is intentionally minimal and tuned for small-model tool loops.
