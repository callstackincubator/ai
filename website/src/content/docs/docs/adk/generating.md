---
title: "Generating"
---

Generate text on Android with Gemini Nano: pass `adk()` to the AI SDK's
`generateText` or `streamText`. The examples on this page run on device. For
cloud Gemini, create the model as shown in
[Models & Availability](/docs/adk/models#cloud-gemini); everything else stays
the same.

## Text Generation

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

const { text } = await generateText({
  model: adk(),
  prompt: 'Explain quantum computing in simple terms',
})
```

The first call prepares Gemini Nano. To avoid the wait, call `adk.prepareNano()`
ahead of time, once [the availability check](/docs/adk/models#availability-check)
passes.

## Streaming

```typescript
import { adk } from '@react-native-ai/adk'
import { streamText } from 'ai'

const { textStream } = streamText({
  model: adk(),
  prompt: 'Write a short story about a robot learning to paint',
})

for await (const delta of textStream) {
  console.log(delta)
}
```

Streaming needs the [polyfills](/docs/polyfills).

## Token Usage

`usage` reports Gemini's token counts, on `generateText` results and in the
`finish` part of a stream:

```typescript
const { usage } = await generateText({
  model: adk(),
  prompt: 'Count to five.',
})

console.log(usage.inputTokens)
console.log(usage.outputTokens)
console.log(usage.raw?.totalTokenCount)
```

## Tool Calling

Let the model call your JavaScript functions, on device or in the cloud. ADK
runs the tool loop natively, so register each tool with the provider in
`availableTools`, and pass the ones a request may use in `tools` as usual:

```typescript
import { createAdkProvider } from '@react-native-ai/adk'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const getCurrentTime = tool({
  description: 'Get the current time for a city',
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => ({
    city,
    time: new Date().toLocaleTimeString(),
  }),
})

const adk = createAdkProvider({
  availableTools: { getCurrentTime },
})

const { text } = await generateText({
  model: adk(),
  tools: { getCurrentTime },
  prompt: 'What time is it in Warsaw?',
})
```

Because ADK runs the loop:

- AI SDK step controls, such as `stopWhen`, don't limit it.
- Streamed tool calls are marked `providerExecuted: true`.
- A `required` `toolChoice` is ignored with a warning.

## Image Input

Ask about an image by passing it as a file part, as base64, a data URL or a
`Uint8Array`:

```typescript
const { text } = await generateText({
  model: adk(),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        { type: 'file', mediaType: 'image/jpeg', data: base64Image },
      ],
    },
  ],
})
```

File and HTTP URLs aren't supported yet, so read the image first.

## JSON Output

Ask for JSON with `Output.json()`:

```typescript
import { generateText, Output } from 'ai'

const { output } = await generateText({
  model: adk(),
  prompt: 'Return a JSON object with name and age fields.',
  output: Output.json(),
})
```

ADK can't constrain the output to a schema or stream JSON yet, so validate
`output` in your app, for example with zod.

## Options

`temperature`, `maxOutputTokens`, `topP` and `topK` work as usual:

```typescript
const { text } = await generateText({
  model: adk(),
  prompt: 'Write a creative story',
  temperature: 0.8,
  maxOutputTokens: 500,
  topP: 0.9,
  topK: 40,
})
```

:::tip[Long conversations]
Gemini Nano has a small context window and every request sends the whole chat.
To keep a rolling window and summarize older messages, wrap the model with
`wrapLanguageModelWithHistory`. See [Conversation History](/docs/history).
:::
