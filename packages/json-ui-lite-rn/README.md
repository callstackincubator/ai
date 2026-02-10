# `json-ui-lite-rn`

Lightweight JSON UI tooling for React Native + Vercel AI SDK tool calling.

**This package provides:**

- a component/style registry (`GEN_UI_NODE_HINTS`, `GEN_UI_STYLES`)
- a ready-to-use tool set for JSON UI mutation (`createGenUITools`)
- a reusable system prompt builder (`buildGenUISystemPrompt`)
- a React Native renderer for specs (`GenerativeUIView`)

**Why this package?** a.k.a. prior art

There exists a great library for streaming interfaces: [`json-render`](https://github.com/vercel-labs/json-render). The full specification is provided in this section, but **TLDR**: this library - `json-ui-lite-rn` - is the choice for small language models (e.g. parameters in the order of magnitude of 3B), which is usually the case if you are running inference locally, on-device. If you are using a cloud provider (OpenAI or Antrophic API), then you will want to go with `json-render` instead.

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

## Prior art

[`json-render`](https://github.com/vercel-labs/json-render) is an alternative that has existed before this library was introduced.
It provides a package both for React and React Native integration and is also compatible with the [AI SDK](https://github.com/vercel/ai). Its design involves two primary concepts:

- the LLM streams the UI directly in a predefined format and all outputs are intercepted by the stream parser
- the library provides a (long) system prompt which well describes that format for the LLM to follow, along with examples

This is good if you are running a large language model, such as the powerful models provided by cloud providers like OpenAPI or Antrophic. However, if you are running locally, for instance using Apple Foundation models, you will encounter the following problems:

- context window size limit - Apple Foundation models have 4096 tokens, meaning roughly 2-3 times as much latin characters (even less multi-byte chars); if you consider the long system prompt (which is needed since the format is complex), you will soon run out of tokens in this window and need e.g. to summarize
- model comprehension - json-render introduces complex actions and state capabilities, while just generating static UIs is a complex task for small language models; thus, json-render is an overkill that the local model may not manage to power

This library solves this:

- instead of a feature-rich, complex format for streaming, we use tool calling - thus, the model outputs small JSONs in parts by calling tools on smaller pieces, reducing the probability of errors
- the feature set is more narrow, currently supporting only static UIs (which will change in the future), for models with less parameters to be able to complete the given tasks successfully

## License

MIT
