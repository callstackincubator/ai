---
title: "Tools"
---

Apple runs tools itself, inside the Foundation Models session, instead of
returning tool calls for the AI SDK to execute. This changes how you register
tools and which AI SDK features apply.

## Tool Calling

Native code needs to know your tools before generation starts, so register them
with the provider in `availableTools`, then pass the ones a request may use in
`tools` as usual:

```typescript
import { createAppleProvider } from '@react-native-ai/apple'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const getWeather = tool({
  description: 'Get current weather information.',
  inputSchema: z.object({
    city: z.string(),
  }),
  execute: async ({ city }) => `Weather in ${city}: sunny`,
})

const apple = createAppleProvider({
  availableTools: { getWeather },
})

const result = await generateText({
  model: apple(),
  prompt: 'What is the weather in Paris?',
  tools: { getWeather },
})
```

A tool passed in `tools` but not registered throws. To change the registered
tools later, keep the model in a variable and update it before generating:

```typescript
const model = apple()
model.updateTools({ getWeather, getForecast })
```

Because Apple runs the whole tool loop natively:

- AI SDK step controls such as `stopWhen`, `onStepStart`, and `onStepEnd` do
  not run for Apple tool calls. Use
  [`maxToolCalls`](#limiting-tool-calls) to bound the loop.
- Tool calls and results are reported with Apple's tool call IDs, in
  `generateText` content and as stream parts in `streamText`.
- When streaming, each `tool-call` part arrives together with its
  `tool-result`, once the tool has returned.

## Tool Choice

| `toolChoice`                 | Effect                                                                        | iOS |
| ---------------------------- | ----------------------------------------------------------------------------- | --- |
| `'auto'`                     | The model decides whether to call tools                                       | 26  |
| `'none'`                     | Tools are left out. On iOS 27 built-in tools are turned off too               | 26  |
| `'required'`                 | The model calls at least one tool before it answers                           | 27  |
| `{ type: 'tool', toolName }` | Only that tool is offered, without built-in tools, and the model must call it | 27  |

Older versions throw `UNSUPPORTED_OS` for `'required'` and a named tool.

## Limiting Tool Calls

On iOS 27, `providerOptions.apple.maxToolCalls` caps how many tool calls Apple
runs in one generation, across all tools including built-in ones. Once it is
reached, the model answers without calling more tools. Parallel calls in the
same round still run, so the count can go over by a few:

```typescript
const result = await generateText({
  model: apple(),
  prompt: 'Compare the weather in Paris, London, and Rome.',
  tools: { getWeather },
  providerOptions: {
    apple: { maxToolCalls: 2 },
  },
})
```

Older versions throw `UNSUPPORTED_OS`.

## Built-In Tools

iOS 27 ships tools that run on device without any JavaScript. Enable them with
`providerOptions.apple.builtInTools`:

| Tool        | What it does                                      | Check with              |
| ----------- | ------------------------------------------------- | ----------------------- |
| `ocr`       | Reads text in images with Vision                  | `supportsVisionTools`   |
| `barcode`   | Reads barcodes and QR codes in images with Vision | `supportsVisionTools`   |
| `spotlight` | Searches your app's Core Spotlight index          | `supportsSpotlightTool` |

```typescript
const result = await generateText({
  model: apple(),
  prompt: 'What did I note about the Kyoto trip?',
  providerOptions: {
    apple: { builtInTools: ['spotlight'] },
  },
})
```

The Spotlight tool only finds what your app indexed with `CSSearchableIndex`
from native code. None of the built-in tools run in the iOS Simulator, and
older versions throw `UNSUPPORTED_OS`.
