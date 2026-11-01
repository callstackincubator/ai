---
title: "Generating"
---

Generate text with Gemini Nano: pass `android()` to the AI SDK's `generateText`
or `streamText`.

## Text Generation

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

## Options

`temperature`, `topK`, `seed` and `maxOutputTokens` go to ML Kit. `topP`,
`stopSequences`, `presencePenalty` and `frequencyPenalty` return an
`unsupported` warning.

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

## Structured Output

Not supported: `Output.object` and `responseFormat: { type: 'json' }` return an
`unsupported` warning, and the model answers in text. ML Kit only generates
structured output for Kotlin classes compiled with its KSP processor, not for a
JSON Schema at runtime.

## Conversations

Pass the conversation as `messages`. The provider sends the whole history to
Gemini Nano on every call, as user and model turns, so it keeps no session of
its own. Keep the history within the [context window](#context-window).

:::note
Gemini Nano versions without system prompt support (the `systemPrompt`
feature), such as `nano-v2` on a Pixel 9 Pro, read only the first text part of
a request. On those, the provider merges the system instruction and the text
of every turn into one prompt, with the images first and each turn labeled by
role, so the model sees the whole conversation. Models with system prompt support get the instruction and
the turns separately.
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

## Image Prompts

Gemini Nano takes up to 10 images per request. Pass bytes, base64, or a local
`file://` or `content://` URL:

```typescript
const { text } = await generateText({
  model: android(),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          mediaType: 'image/jpeg',
          data: new URL('file:///path/to/photo.jpg'),
        },
        { type: 'text', text: 'What is in this photo?' },
      ],
    },
  ],
})
```

Other file types, such as audio, are rejected with `INVALID_MESSAGE`.

## Reasoning

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

## Context Window

The context size depends on the device's Gemini Nano, so read it at runtime:

```typescript
const { contextSize } = await android.getModelInfo()
```

To keep long chats inside it, wrap the model with
`wrapLanguageModelWithHistory`, which keeps a rolling window and summarizes
older messages. See [Conversation History](/docs/history).

ML Kit reports no token usage, so `usage` is empty. Count a prompt's tokens
with `countTokens`:

```typescript
const tokens = await android().countTokens('How long is this prompt?')
```
