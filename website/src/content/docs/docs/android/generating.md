---
title: "Generating"
---

`android()` is an AI SDK language model, so `generateText` and `streamText`
work as with any provider.

## Generating Text

```typescript
import { android } from '@react-native-ai/android'
import { generateText } from 'ai'

const { text } = await generateText({
  model: android(),
  system: 'You are a helpful travel assistant.',
  prompt: 'Suggest three things to do in Kraków.',
})
```

System messages go to ML Kit as its system instruction.

## Streaming

```typescript
import { android } from '@react-native-ai/android'
import { streamText } from 'ai'

const result = streamText({
  model: android(),
  prompt: 'Write a short poem about the sea.',
})

for await (const delta of result.textStream) {
  console.log(delta)
}
```

Pass an `abortSignal` to stop a generation. The native request is cancelled too.

## Conversations

Pass the conversation as `messages`. The provider sends the whole history to
Gemini Nano on every call, as user and model turns, so it keeps no session of
its own. Keep the history within the context window, which
[`getModelInfo()`](/docs/android/models) reports as `contextSize`.

:::caution
Older Gemini Nano versions may only answer the first turn of a conversation.
On a Pixel 9 Pro with `nano-v2`, the model replies to the first user message
and ignores the rest. The provider sends the history as ML Kit takes it and
doesn't merge turns into one prompt.
:::

```typescript
const { text } = await generateText({
  model: android(),
  messages: [
    { role: 'user', content: 'My name is Ada.' },
    { role: 'assistant', content: 'Nice to meet you, Ada!' },
    { role: 'user', content: 'What is my name?' },
  ],
})
```

## Images

Gemini Nano takes up to 10 images per request. Pass bytes, base64, or a local
`file://` or `content://` URL:

```typescript
const { text } = await generateText({
  model: android(),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'file', mediaType: 'image/jpeg', data: 'file:///path/to/photo.jpg' },
        { type: 'text', text: 'What is in this photo?' },
      ],
    },
  ],
})
```

Other file types, such as audio, are rejected with `INVALID_MESSAGE`.

## Thinking Mode

Where the device's Gemini Nano supports thinking (`features` includes
`'thinking'`), any `reasoning` level other than `'none'` turns it on, and the
thoughts come back as reasoning parts. Gemini Nano's thinking is on or off,
with no budget. Without thinking support, the request runs without it and
returns an `unsupported` warning for `reasoning`.

```typescript
const result = streamText({
  model: android(),
  reasoning: 'high',
  prompt: 'Is 17 a prime number?',
})
```

`providerOptions.android.enableThinking` turns it on or off when `reasoning` is
not set.

## Settings

`temperature`, `topK`, `seed` and `maxOutputTokens` go to ML Kit. ML Kit reports
no token usage, so `usage` is empty; count tokens with `countTokens`:

```typescript
const tokens = await android().countTokens('How long is this prompt?')
```

## Errors

Errors carry a `code` from `AndroidAIErrorCodes`:

| Code | Meaning |
| --- | --- |
| `MODEL_UNAVAILABLE` | The device can't run the model, or needs an AICore or system update |
| `MODEL_DOWNLOADING` | The model is still downloading |
| `DOWNLOAD_FAILED` | Downloading the model failed |
| `FEATURE_NOT_SUPPORTED` | ML Kit reports the request needs a feature the model doesn't have |
| `RATE_LIMITED` | AICore is busy or the app used up its quota. Wait a few seconds and retry |
| `BACKGROUND_USE_BLOCKED` | AICore only serves apps in the foreground |
| `CONTEXT_WINDOW_EXCEEDED` | The request is longer than the context window |
| `INVALID_MESSAGE` | The prompt has something Gemini Nano can't take, such as an audio file |
| `INVALID_SCHEMA` | A tool's JSON Schema can't be converted |
| `GENERATION_ERROR` | Anything else |

```typescript
import { AndroidAIErrorCodes, type AndroidAIError } from '@react-native-ai/android'

try {
  await generateText({ model: android(), prompt })
} catch (error) {
  if ((error as AndroidAIError).code === AndroidAIErrorCodes.RateLimited) {
    // Wait and retry
  }
}
```

AICore rejects requests an app sends in quick succession, so space out
automated requests by a few seconds.
