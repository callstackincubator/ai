# `json-ui-lite-rn`

Lightweight JSON UI tooling for React Native + Vercel AI SDK tool calling.

This package provides:

- a component/style registry (`GEN_UI_NODE_HINTS`, `GEN_UI_STYLES`)
- a ready-to-use tool set for JSON UI mutation (`createGenUITools`)
- a reusable system prompt builder (`buildGenUISystemPrompt`)
- a React Native renderer for specs (`GenerativeUIView`)

## Requirements

- React Native app
- Vercel AI SDK tool-calling flow (`streamText`, `generateText`, etc.)
- model that supports tool calling

## Installation

```sh
bun add json-ui-lite-rn
```

## Quick Start

```ts
import { streamText } from 'ai'
import {
  buildGenUISystemPrompt,
  createGenUITools,
  setToolExecutionReporter,
} from 'json-ui-lite-rn'

type UISpec = {
  root: string
  elements: Record<
    string,
    { type: string; props: Record<string, unknown>; children?: string[] }
  >
}

const tools = createGenUITools<UISpec>({
  contextId: chatId,
  getSpec: (id) => getSpecForChat(id),
  updateSpec: (id, nextSpec) => setSpecForChat(id, nextSpec),
})

setToolExecutionReporter(({ toolName, args }) => {
  console.log('tool call', toolName, args)
})

const result = streamText({
  model,
  messages,
  tools,
  system: buildGenUISystemPrompt({
    additionalInstructions:
      'Keep responses short. Ask follow-up questions when UI intent is unclear.',
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

`reorderUINodes` moves one sibling around another:

- `nodeId`: node to move
- `otherId`: sibling anchor
- `mode`: `'pre' | 'post'`

Options:

- `contextId`: string key for your current conversation/context
- `getSpec(contextId)`: return current spec (or `null`)
- `updateSpec(contextId, spec)`: persist changes
- `createId`: optional id factory
- `rootId`: optional root id override (default: `"root"`)
- `nodeHints`: optional component registry override
- `nodeNamesThatSupportChildren`: optional parent whitelist override

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

Renders a JSON UI spec directly in React Native:

```tsx
import { GenerativeUIView } from 'json-ui-lite-rn'
;<GenerativeUIView spec={spec} loading={isGenerating} />
```

Props:

- `spec`: `{ root, elements }` object (or `null`/`undefined`)
- `loading`: optional boolean for empty-state loading text

## Notes

- style validation is schema-based (`zod`) through `GEN_UI_STYLES`
- tools are framework-agnostic as long as your spec matches `{ root, elements }`
- this package is intentionally minimal and optimized for small-model tool loops

## License

MIT
