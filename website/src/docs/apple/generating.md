# Generating

Use `@react-native-ai/apple` with the Vercel AI SDK to call Apple Foundation
Models from React Native. The provider keeps the common text, object,
streaming, tool, and image APIs aligned with AI SDK v7, and exposes a small
Apple-specific surface for runtime model information and Apple-only options.

## Requirements

- iOS 26+ for Apple Foundation Models text generation.
- iOS 26.4+ for token counting.
- iOS 26.4 for Image Playground image generation. Apple removed it in iOS 27.
- iOS 27+ for multimodal image prompts, Private Cloud Compute language models,
  reasoning levels, Vision built-in tools, and token usage.
- Apple's managed Private Cloud Compute entitlement for the
  `private-cloud-compute` model. Private Cloud Compute does not run in the iOS
  Simulator, so test it on a physical device.
- An Apple Intelligence-capable device with Apple Intelligence enabled.
- React Native New Architecture.

Some Apple Intelligence symbols are SDK-gated as well as OS-gated. If you build
with an older Xcode SDK that does not expose a newer Apple API, the provider
keeps that feature unavailable instead of failing native compilation. See
[iOS Versions](./ios-versions) for what works on iOS 26, iOS 26.4, and iOS 27.

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

Call `prepare()` shortly before the first generation, for example when the
user opens a chat, to load the model into memory so it answers sooner:

```typescript
const model = apple()
await model.prepare()
```

Configure the model with the normal AI SDK generation options:

```typescript
const result = await generateText({
  model: apple(),
  prompt: 'Write a concise product announcement.',
  temperature: 0.6,
  maxOutputTokens: 300,
  topP: 0.9,
})
```

Do not pass both `topP` and `topK` in the same request. Apple Foundation Models
supports one sampling strategy at a time.

Pass `seed` to get the same answer for the same prompt and settings. Without
`topP` or `topK`, a seed samples from every token like Apple's default
sampling.

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

Structured output (`Output.object`) also works with `streamText`, but Apple
returns partial objects that are not prefixes of the final JSON, so the provider
sends the complete object once generation finishes instead of streaming it.

## Structured Output

Use `Output.object` when you want Apple guided generation through the AI SDK:

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

Supported schema shapes include objects, arrays, strings, numbers, booleans,
and enums. References to `$defs` or `definitions` work too, including
recursive schemas that reference themselves with `#`. String formats, regular expressions, and unions are not currently
mapped to Apple Foundation Models.

## Availability And Model Info

Check availability before using the Apple Intelligence wrapper backend or showing Apple-only UI:

```typescript
import { apple } from '@react-native-ai/apple'

if (!apple.isAvailable()) {
  // Show fallback UI or use another provider.
}
```

For capability-aware UI, ask native for the active model metadata:

```typescript
const info = await apple.getModelInfo({ locale: 'en-US' })

console.log(info.availability)
console.log(info.contextSize)
console.log(info.supportsImagePrompts)
console.log(info.supportsVisionTools)
```

`getModelInfo` returns availability, locale support, supported languages,
context size when Apple exposes it, and feature flags for token counting,
image prompts, reasoning, Private Cloud Compute, Dynamic Profiles, and Vision
built-in tools.

When the model is unavailable, `availability` tells you why, so you can show
something more useful than a generic error:

| `availability`                | Model                   | Meaning                                                              |
| ----------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `available`                   | both                    | The model is ready to use                                            |
| `deviceNotEligible`           | both                    | The device does not support this model                               |
| `appleIntelligenceNotEnabled` | `system`                | Apple Intelligence is turned off, ask the user to enable it          |
| `modelNotReady`               | `system`                | The model is still downloading, try again later                      |
| `systemNotReady`              | `private-cloud-compute` | Private Cloud Compute is not ready yet, try again later              |
| `missingEntitlement`          | `private-cloud-compute` | The app does not set `AppleLLMPrivateCloudCompute` in its Info.plist |
| `unknown`                     | both                    | A reason this version of the library does not know about yet         |

```typescript
const { availability } = await apple.getModelInfo()

if (availability === 'appleIntelligenceNotEnabled') {
  // Ask the user to turn on Apple Intelligence in Settings.
}
```

When Private Cloud Compute is unavailable, `contextSize` is omitted,
`supportsLocale` is `false` and `supportedLanguages` is empty.

## Private Cloud Compute

The default `apple()` model uses `SystemLanguageModel.default`. On iOS 27 and
newer, choose Apple's Private Cloud Compute language model by its model ID:

```typescript
const result = await generateText({
  model: apple('private-cloud-compute'),
  prompt: 'Analyze this longer task with more reasoning.',
})
```

`apple({ model: 'private-cloud-compute' })` is equivalent. You can also create a
provider with a default model:

```typescript
import { createAppleProvider } from '@react-native-ai/apple'

const apple = createAppleProvider({
  model: 'private-cloud-compute',
})
```

Call `apple.getModelInfo({ model: 'private-cloud-compute' })` before enabling
this path. It requires iOS 27 APIs and the managed
`com.apple.developer.private-cloud-compute` entitlement, which Apple grants on
request.

### Enabling Private Cloud Compute

Once your team has the entitlement, enable it with the package's Expo config
plugin. It adds the entitlement and the `AppleLLMPrivateCloudCompute`
Info.plist key:

```json title="app.json"
{
  "expo": {
    "plugins": [["@react-native-ai/apple", { "privateCloudCompute": true }]]
  }
}
```

Without Expo, add the entitlement to your app's `.entitlements` file and set
the Info.plist key yourself:

```xml title="Info.plist"
<key>AppleLLMPrivateCloudCompute</key>
<true/>
```

:::warning
Foundation Models stops the app with a fatal error, which cannot be caught,
when it uses Private Cloud Compute without the entitlement, and iOS has no API
to check for it. As a workaround, the model reports `missingEntitlement` and
generation fails with `MODEL_UNAVAILABLE` until the Info.plist key is set, so
only set it in builds signed with the entitlement. This check will be removed
once Foundation Models reports a missing entitlement as an error.
:::

When the Private Cloud Compute quota is reached,
generation fails with `RATE_LIMITED`.

## Guardrails

Apple Foundation Models apply content guardrails to prompts and responses. Apps
that transform legitimate but sensitive content, such as health or medical
data, can hit guardrail violations with the default mode. Opt into
Apple's permissive mode for those use cases:

```typescript
import { createAppleProvider } from '@react-native-ai/apple'

const apple = createAppleProvider({
  guardrails: 'permissiveContentTransformations',
})
```

`apple({ guardrails: 'permissiveContentTransformations' })` sets it for a single
model instance. Guardrails apply to the on-device `system` model only and are
ignored by `private-cloud-compute`. See
[Improving the safety of generative model output](https://developer.apple.com/documentation/foundationmodels/improving-the-safety-of-generative-model-output#Use-permissive-guardrail-mode-for-sensitive-content)
for when this mode is appropriate.

## Content Tagging

Apple ships an adapter of the on-device model for tagging, entity extraction,
and topic detection. Use it with `useCase: 'contentTagging'`, usually with
structured output:

```typescript
const result = await generateText({
  model: apple({ useCase: 'contentTagging' }),
  prompt: article,
  output: Output.object({
    schema: z.object({ topics: z.array(z.string()) }),
  }),
})
```

`createAppleProvider({ useCase: 'contentTagging' })` sets it for every model.
Like guardrails, it applies to the on-device `system` model only.

## Reasoning Level

On iOS 27 and newer, set how much reasoning the model should do before
answering with the AI SDK `reasoning` call option:

```typescript
const result = await generateText({
  model: apple(),
  prompt: 'Plan a three-day trip to Kyoto.',
  reasoning: 'medium',
})
```

Apple has three reasoning levels. `minimal` and `low` map to `light`, `medium`
to `moderate`, and `high` and above to `deep`. `none` and `provider-default`
keep Apple's default.

Setting `reasoning` on older iOS versions fails with `UNSUPPORTED_OS`.
Models that cannot reason, such as the on-device system model on current
hardware, ignore it and return an `unsupported` warning instead. Check
`supportsReasoning` from `getModelInfo` to know ahead of time; Private Cloud
Compute supports reasoning.

Reasoning is returned as `reasoning` content (streamed as reasoning parts on
iOS 27). Its `providerMetadata.apple` marks it as Apple reasoning, so it is
replayed in later turns; reasoning from other providers is left out of the
transcript.

## Image Prompts

On iOS 27 and newer, Apple Foundation Models can analyze images alongside text
prompts. Pass images through the AI SDK message format:

```typescript
import { apple } from '@react-native-ai/apple'
import { generateText } from 'ai'

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

console.log(result.text)
```

The provider accepts local file URLs, absolute file paths, base64 image data,
and image data URLs. Remote HTTP URLs are not sent directly to Apple; download
them first and pass a local file URL or base64 payload.

Each image is labeled with its `filename` when one is set, and `image-1`,
`image-2`, ... otherwise. The model sees these labels, so a descriptive filename
such as `receipt.png` helps it tell apart several images in one prompt.

Apple Foundation Models only reads images on the final user prompt. Images in
earlier user turns are left out of the history sent to the model. Passing image
parts on older OS versions throws `AppleLLMErrorCodes.UnsupportedOS`.

## Image Generation

:::warning
`apple.imageModel()` is deprecated and will be removed in the next major
version. Apple discontinued Image Playground's `ImageCreator` in iOS 27, so the
model throws `UNSUPPORTED_OS` there. To generate images on iOS 27, present
Apple's `imagePlaygroundSheet` from native code or use another image provider.
:::

On iOS 26.4, use the AI SDK image API with Apple's Image Playground framework:

```typescript
import { apple } from '@react-native-ai/apple'
import { generateImage } from 'ai'

const result = await generateImage({
  model: apple.imageModel({
    style: 'illustration',
    personalization: 'disabled',
  }),
  prompt: 'A friendly robot watering balcony herbs',
  n: 1,
})

const base64Png = result.images[0].base64
```

The provider uses `ImageCreator` and returns PNG images. Supported styles are
`animation`, `illustration`, and `sketch`. `any`, `emoji`, and
`externalProvider` need iOS 27, which has no `ImageCreator`, so they fall back
to `illustration`. Apple supports at most one source image
concept for generation, so pass no more than one file. Personalization is
applied when the app is built with an SDK that exposes `ImagePlaygroundOptions`.

Per-call Apple options can override model defaults:

```typescript
const result = await generateImage({
  model: apple.imageModel(),
  prompt: 'A hand-drawn icon for a notes app',
  providerOptions: {
    apple: {
      style: 'sketch',
      personalization: 'disabled',
    },
  },
})
```

## Tool Calling

Apple executes tools inside the Foundation Models session. Register JavaScript
tools up front so native can call them by name:

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
  availableTools: {
    getWeather,
  },
})

const result = await generateText({
  model: apple(),
  prompt: 'What is the weather in Paris?',
  tools: {
    getWeather,
  },
})
```

Important Apple-specific behavior:

- Tool calls are provider-executed, so AI SDK step callbacks such as
  `stopWhen`, `onStepStart`, and `onStepEnd` do not run for native Apple
  tool execution.
- Tool calls and their results are reported with Apple's tool call IDs, in
  `generateText` content and as stream parts in `streamText`.
- You can update the registered tools on a model instance with
  `model.updateTools(...)` before generation.
- On iOS 27, `toolChoice: 'required'` and a named tool make the model call a
  tool before it answers. Earlier versions throw `UNSUPPORTED_OS`.
- On iOS 27, `providerOptions.apple.maxToolCalls` limits how many tool calls
  Apple runs in one generation, across all tools including built-in ones. Once
  it is reached, the model answers without calling more tools. Parallel calls
  in the same round still run, so the count can go over by a few. Earlier
  versions throw `UNSUPPORTED_OS`.

```typescript
const result = await generateText({
  model: apple(),
  prompt: 'Compare the weather in Paris, London, and Rome.',
  tools: {
    getWeather,
  },
  providerOptions: {
    apple: {
      maxToolCalls: 2,
    },
  },
})
```

## Vision Built-In Tools

iOS 27 adds Foundation Models integration with Vision's OCR and barcode tools.
Enable them through Apple provider options:

```typescript
const result = await generateText({
  model: apple(),
  messages,
  providerOptions: {
    apple: {
      builtInTools: ['ocr', 'barcode'],
    },
  },
})
```

These tools require iOS 27. On older systems the provider throws
`AppleLLMErrorCodes.UnsupportedOS`.

## Spotlight Search Tool

iOS 27 also adds a built-in tool that searches your app's Core Spotlight
index, so the model can answer from content your app indexed with
`CSSearchableIndex`, entirely on device:

```typescript
const result = await generateText({
  model: apple(),
  prompt: 'What did I note about the Kyoto trip?',
  providerOptions: {
    apple: {
      builtInTools: ['spotlight'],
    },
  },
})
```

Check `supportsSpotlightTool` from `getModelInfo` to know whether the device
and SDK have it. It does not run in the iOS Simulator. Index content from native code; the tool only finds what your
app has indexed.

## Context Window

Apple's available context depends on the model and OS version. Prefer runtime
metadata over hard-coded values:

```typescript
const info = await apple.getModelInfo()
console.log(info.contextSize)
```

Each response reports token usage in `result.usage`, which AI SDK features
such as `prepareStep` and telemetry read:

- iOS 27 reports the usage measured by Foundation Models, for both the
  on-device model and Private Cloud Compute.
- iOS 26.4 counts the transcript with the on-device model's tokenizer.
- Otherwise usage is `undefined`.

Apple does not say when a response stops at `maxOutputTokens`, so
`finishReason` is `'length'` when the response used every allowed token.

To keep long chats inside the context window, wrap the model with
`wrapLanguageModelWithHistory`. It keeps a rolling window, summarizes older
messages, and counts tokens with the model's `countTokens`. See
[Conversation History](../history.md).

Count tokens before sending a request as an estimate, not a fit guarantee:

```typescript
const model = apple()
const tokenCount = await model.countTokens(
  'Summarize this text in three bullet points.'
)
```

Token counting requires iOS 26.4 and an available on-device model. Private
Cloud Compute has no token counting API, so `countTokens` on a Private Cloud
Compute model still uses the on-device model's tokenizer, whose count may not
match the server model.

The full request also includes instructions, tool definitions, schema text,
attachments, and generated output budget. If Apple reports a context overflow,
trim or summarize and retry.

## Error Handling

When Apple's guardrails flag a prompt or response, or the model refuses, the
response ends like other providers' content filters instead of throwing:
`finishReason` is `'content-filter'`, with `GUARDRAIL_VIOLATION` or `REFUSAL`
as its raw value, and any text streamed before it is kept. The low-level
`AppleFoundationModels` API rejects with those codes instead.

Use public error codes for app control flow:

```typescript
import {
  AppleLLMErrorCodes,
  type AppleLLMError,
  apple,
} from '@react-native-ai/apple'
import { generateText } from 'ai'

try {
  await generateText({
    model: apple(),
    messages,
  })
} catch (error) {
  const appleError = error as AppleLLMError

  if (appleError.code === AppleLLMErrorCodes.ContextWindowExceeded) {
    // Retry with a smaller transcript or a summary.
  }

  throw error
}
```

For streaming, inspect `stream` when you need provider error parts:

```typescript
import {
  AppleLLMErrorCodes,
  type AppleLLMError,
  apple,
} from '@react-native-ai/apple'
import { streamText } from 'ai'

const result = streamText({
  model: apple(),
  messages,
})

for await (const part of result.stream) {
  if (part.type === 'error') {
    const error = part.error as AppleLLMError

    if (error.code === AppleLLMErrorCodes.ModelUnavailable) {
      // Show fallback UI.
    }
  }
}
```

Stable public codes are:

| Code                           | Meaning                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `MODEL_UNAVAILABLE`            | The model is not available, see `getModelInfo` for why           |
| `UNSUPPORTED_OS`               | The feature needs a newer iOS version or SDK                     |
| `GENERATION_ERROR`             | Any other generation failure                                     |
| `INVALID_MESSAGE`              | The prompt cannot be sent to Foundation Models                   |
| `CONFLICTING_SAMPLING_METHODS` | Both `topP` and `topK` were set                                  |
| `INVALID_SCHEMA`               | The schema or one of its constraints is not supported            |
| `TOOL_CALL_ERROR`              | A tool threw                                                     |
| `UNKNOWN_TOOL_CALL_ERROR`      | A tool returned something that is not text or JSON               |
| `CONTEXT_WINDOW_EXCEEDED`      | The transcript does not fit in the context window                |
| `RATE_LIMITED`                 | Too many requests, or the Private Cloud Compute quota is reached |
| `GUARDRAIL_VIOLATION`          | Apple's guardrails flagged the prompt or response                |
| `REFUSAL`                      | The model refused to answer                                      |
| `UNSUPPORTED_LANGUAGE`         | The model does not support the language of the prompt            |
| `ASSETS_UNAVAILABLE`           | The model's assets are not on the device yet                     |
| `CONCURRENT_REQUESTS`          | The model is busy with another request                           |
| `DECODING_FAILURE`             | The model could not produce output that matches the schema       |
| `TIMEOUT`                      | The request took too long (iOS 27)                               |
| `NETWORK_FAILURE`              | Private Cloud Compute could not be reached                       |
| `SERVICE_UNAVAILABLE`          | Private Cloud Compute is temporarily unavailable                 |

## Direct Native API

Prefer the AI SDK models for generation. Use `AppleFoundationModels` only when
you need low-level native access:

```typescript
import { AppleFoundationModels } from '@react-native-ai/apple'

const info = await AppleFoundationModels.getModelInfo('en-US', 'system')
const tokens = await AppleFoundationModels.countTokens('A short prompt')
const { content, usage } = await AppleFoundationModels.generateText(
  [{ role: 'user', content: 'Hello' }],
  { temperature: 0.7, maxTokens: 100 }
)
```

Low-level `generateImages` is available for advanced callers, but
`apple.imageModel()` is the recommended Image Playground integration because it
matches the AI SDK image API.

## Apple Documentation

- [Apple Intelligence](https://developer.apple.com/apple-intelligence/)
- [Foundation Models](https://developer.apple.com/documentation/FoundationModels)
- [Image Playground](https://developer.apple.com/documentation/imageplayground)
- [Managing the on-device foundation model's context window](https://developer.apple.com/documentation/technotes/tn3193-managing-the-on-device-foundation-model-s-context-window)
