# Generating

Use `apple()` with the AI SDK's `generateText` and `streamText` to run Apple
Foundation Models. Text generation needs iOS 26. Features that need a newer
version say so, and [iOS Versions](./ios-versions) has the full matrix.

## Text Generation

```typescript
import { apple } from '@react-native-ai/apple'
import { generateText } from 'ai'

const result = await generateText({
  model: apple(),
  prompt: 'Explain quantum computing in simple terms.',
})

console.log(result.text)
```

Call `prepare()` a little before the first generation, for example when the
user opens a chat, to start loading the model into memory so it answers
sooner. It resolves once loading has started, not when the model is ready, so
call it at least a second ahead rather than right before generating:

```typescript
const model = apple()
await model.prepare()
```

## Options

The standard AI SDK generation options work:

```typescript
const result = await generateText({
  model: apple(),
  prompt: 'Write a concise product announcement.',
  temperature: 0.6,
  maxOutputTokens: 300,
  topP: 0.9,
})
```

- **`topP` and `topK`.** Apple supports one sampling strategy at a time, so
  passing both fails with `CONFLICTING_SAMPLING_METHODS`.
- **`seed`.** A non-negative whole number makes answers more repeatable for the
  same prompt and settings, but Apple does not guarantee the exact same answer.
  Without `topP` or `topK`, a seed samples from every token like Apple's
  default sampling.

## Streaming

```typescript
import { apple } from '@react-native-ai/apple'
import { streamText } from 'ai'

const result = streamText({
  model: apple(),
  prompt: 'Draft a short release note.',
})

for await (const delta of result.textStream) {
  console.log(delta)
}
```

## Structured Output

Use `Output.object` to generate an object that matches a schema. It uses
Apple's guided generation, so the model can only produce valid output:

```typescript
import { apple } from '@react-native-ai/apple'
import { generateText, Output } from 'ai'
import { z } from 'zod'

const result = await generateText({
  model: apple(),
  prompt: 'Create a compact user profile for a software developer.',
  output: Output.object({
    schema: z.object({
      name: z.string(),
      role: z.string(),
      seniority: z.enum(['junior', 'mid', 'senior']),
    }),
  }),
})

console.log(result.output)
```

Guided generation supports:

- Objects, arrays, strings, numbers, integers, booleans, and enums
- Unions (`anyOf`, e.g. `z.union`) and literals (`z.literal`)
- Regular expressions (`z.string().regex()`)
- Number bounds (`min`, `max`) and array length (`minItems`, `maxItems`)
- References to `$defs` or `definitions`, including recursive schemas

String formats such as `z.email()` are ignored, and `multipleOf` fails with
`INVALID_SCHEMA`.

`Output.object` also works with `streamText`, but Apple's partial objects are
not prefixes of the final JSON, so the provider sends the complete object once
generation finishes instead of streaming it.

## Image Prompts

On iOS 27, the model can read images alongside text. Pass them as `file` parts:

```typescript
const result = await generateText({
  model: apple(),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image for accessibility.' },
        {
          type: 'file',
          mediaType: 'image/jpeg',
          data: 'file:///path/to/photo.jpg',
        },
      ],
    },
  ],
})
```

- **Sources.** Local file URLs, absolute file paths, base64 data, and data URLs
  work. Download remote URLs first and pass a local file URL or base64 data.
- **Labels.** Each image is labeled with its `filename`, or `image-1`,
  `image-2`, ... when it has none. The model sees these labels, so a
  descriptive filename such as `receipt.png` helps it tell several images
  apart.
- **History.** Apple only reads images on the final user prompt. Images in
  earlier turns are left out.

Check `supportsImagePrompts` from [`getModelInfo`](./models#availability-and-model-info)
before sending images. Older versions throw `UNSUPPORTED_OS`.

## Reasoning

On iOS 27, set how much the model reasons before answering with the AI SDK
`reasoning` option:

```typescript
const result = await generateText({
  model: apple('private-cloud-compute'),
  prompt: 'Plan a three-day trip to Kyoto.',
  reasoning: 'medium',
})

console.log(result.reasoningText)
```

Apple has three levels. `minimal` and `low` map to `light`, `medium` to
`moderate`, and `high` and above to `deep`. `none` and `provider-default` keep
Apple's default.

Private Cloud Compute supports reasoning. Models that cannot reason, such as
the on-device model on current hardware, ignore the option and return an
`unsupported` warning, so check `supportsReasoning` from `getModelInfo` first.
Older versions throw `UNSUPPORTED_OS`.

Reasoning is returned as `reasoning` content, and streamed as reasoning parts.
It is replayed in later turns, while reasoning from other providers is left out
of the transcript.

## Context Window

The context size depends on the model and iOS version, so read it at runtime
instead of hard-coding it:

```typescript
const { contextSize } = await apple.getModelInfo()
```

To keep long chats inside it, wrap the model with
`wrapLanguageModelWithHistory`, which keeps a rolling window and summarizes
older messages. See [Conversation History](../history.md).

**Token usage.** `result.usage` is measured by Foundation Models on iOS 27, for
both models. On iOS 26.4 it is counted with the on-device tokenizer, and before
that it is `undefined`. Apple does not say when a response stops at
`maxOutputTokens`, so `finishReason` is `'length'` when the response used every
allowed token.

**Counting tokens.** `countTokens` estimates a prompt's size before you send
it. It needs iOS 26.4:

```typescript
const model = apple()
const tokenCount = await model.countTokens(
  'Summarize this text in three bullet points.'
)
```

The count is an estimate, not a guarantee. The full request also includes
instructions, tool definitions, schema text, and the output budget. Private
Cloud Compute has no token counting API, so its count uses the on-device
tokenizer and may not match the server model.

## Image Generation

:::warning Deprecated
`apple.imageModel()` only works on iOS 26.4, since Apple discontinued Image
Playground's `ImageCreator` in iOS 27, and it will be removed in the next major
version. On iOS 27, present Apple's `imagePlaygroundSheet` from native code or
use another image provider.
:::

```typescript
import { apple } from '@react-native-ai/apple'
import { generateImage } from 'ai'

const result = await generateImage({
  model: apple.imageModel({ style: 'illustration' }),
  prompt: 'A friendly robot watering balcony herbs',
})

const base64Png = result.images[0].base64
```

Styles are `animation`, `illustration`, and `sketch`, set on the model or per
call in `providerOptions.apple`, along with `personalization` (`automatic`,
`enabled`, or `disabled`). Pass at most one source image.

## Direct Native API

Prefer the AI SDK models. `AppleFoundationModels` is the low-level native
module they use:

```typescript
import { AppleFoundationModels } from '@react-native-ai/apple'

const info = await AppleFoundationModels.getModelInfo('en-US', 'system')
const tokens = await AppleFoundationModels.countTokens('A short prompt')
const { content, usage } = await AppleFoundationModels.generateText(
  [{ role: 'user', content: 'Hello' }],
  { temperature: 0.7, maxTokens: 100 }
)
```

## Apple Documentation

- [Foundation Models](https://developer.apple.com/documentation/FoundationModels)
- [Managing the on-device foundation model's context window](https://developer.apple.com/documentation/technotes/tn3193-managing-the-on-device-foundation-model-s-context-window)
