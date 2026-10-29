---
title: "Generating"
---

Generate text on Android with Gemini Nano: pass `adk()` to the AI SDK's
`generateText` or `streamText`.

## Text Generation

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

const { text } = await generateText({
  model: adk(),
  prompt: 'Explain quantum computing in simple terms',
})
```

The first call prepares Gemini Nano. To avoid the wait, call
[`prepare()`](/docs/adk/models#preparing) ahead of time.

System messages and the provider's `instruction` become the ADK agent's
instruction.

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
```

## Image Input

Ask about an image by passing it as a file part, as base64, a data URL, a
`Uint8Array`, or a `file://` or `content://` URL:

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

HTTP URLs aren't supported, so download the image first.

## Options

`temperature`, `maxOutputTokens` and `topK` work as usual. Gemini Nano ignores
`topP`, `seed`, `stopSequences`, `presencePenalty` and `frequencyPenalty` with an
`unsupported` warning. Tools and JSON output return the same warning: ADK's ML
Kit model has no tool calling or structured output yet.

```typescript
const { text } = await generateText({
  model: adk(),
  prompt: 'Write a creative story',
  temperature: 0.8,
  maxOutputTokens: 500,
  topK: 40,
})
```

## Errors

Errors from the provider have a `code`:

```typescript
import { AdkErrorCodes } from '@react-native-ai/adk'

try {
  await generateText({ model: adk(), prompt: 'Hello' })
} catch (error) {
  if (error.code === AdkErrorCodes.ModelDownloading) {
    // Try again once Android has downloaded Gemini Nano
  }
}
```

| `code`                    | Meaning                                                  |
| ------------------------- | -------------------------------------------------------- |
| `UNSUPPORTED_PLATFORM`    | Not running on Android                                   |
| `MODEL_UNAVAILABLE`       | This device can't run Gemini Nano                        |
| `MODEL_DOWNLOADING`       | Android is still downloading Gemini Nano                 |
| `DOWNLOAD_FAILED`         | Downloading Gemini Nano failed                           |
| `CONTEXT_WINDOW_EXCEEDED` | The request is longer than the model's context           |
| `RATE_LIMITED`            | Too many requests, or AICore's per-app quota was reached |
| `BACKGROUND_USE_BLOCKED`  | Gemini Nano only runs while the app is in the foreground |
| `INVALID_MESSAGE`         | The prompt has a part the provider can't send            |
| `GENERATION_ERROR`        | Any other failure                                        |

:::tip[Long conversations]
Gemini Nano has a small context window and every request sends the whole chat.
To keep a rolling window and summarize older messages, wrap the model with
`wrapLanguageModelWithHistory`. See [Conversation History](/docs/history).
:::
