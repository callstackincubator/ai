# Generating

Use `@react-native-ai/apple` with the Vercel AI SDK to call Apple Foundation
Models from React Native. The provider keeps the common text, object,
streaming, tool, and image APIs aligned with AI SDK v5, and exposes a small
Apple-specific surface for runtime model information and Apple-only options.

## Requirements

- iOS 26+ for Apple Foundation Models text generation.
- iOS 26.4+ for token counting and Image Playground image generation.
- iOS 27+ for multimodal image prompts, Private Cloud Compute language models,
  Dynamic Profiles, and Vision built-in tools.
- An Apple Intelligence-capable device with Apple Intelligence enabled.
- React Native New Architecture.

Some Apple Intelligence symbols are SDK-gated as well as OS-gated. If you build
with an older Xcode SDK that does not expose a newer Apple API, the provider
keeps that feature unavailable instead of failing native compilation.

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

Configure the model with the normal AI SDK generation options:

```typescript
const result = await generateText({
  model: apple(),
  prompt: 'Write a concise product announcement.',
  temperature: 0.6,
  maxTokens: 300,
  topP: 0.9,
})
```

Do not pass both `topP` and `topK` in the same request. Apple Foundation Models
supports one sampling strategy at a time.

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

Streaming structured objects are not currently supported by this provider.

## Structured Output

Use `generateObject` when you want Apple guided generation through the AI SDK:

```typescript
import { apple } from '@react-native-ai/apple'
import { generateObject } from 'ai'
import { z } from 'zod'

const result = await generateObject({
  model: apple(),
  prompt: 'Create a compact user profile for a software developer.',
  schema: z.object({
    name: z.string(),
    role: z.string(),
    seniority: z.enum(['junior', 'mid', 'senior']),
  }),
})

console.log(result.object)
```

Supported schema shapes include objects, arrays, strings, numbers, booleans,
and enums. String formats, regular expressions, and unions are not currently
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

console.log(info.isAvailable)
console.log(info.contextSize)
console.log(info.supportsImagePrompts)
console.log(info.supportsVisionTools)
```

`getModelInfo` returns availability, locale support, supported languages,
context size when Apple exposes it, and feature flags for token counting,
image prompts, Private Cloud Compute, Dynamic Profiles, and Vision built-in
tools.

## Private Cloud Compute

The default `apple()` model uses `SystemLanguageModel.default`. On iOS 27 and
newer, choose Apple's Private Cloud Compute language model with provider
options:

```typescript
const result = await generateText({
  model: apple(),
  prompt: 'Analyze this longer task with more reasoning.',
  providerOptions: {
    apple: {
      model: 'private-cloud-compute',
    },
  },
})
```

You can also create a provider with a default model:

```typescript
import { createAppleProvider } from '@react-native-ai/apple'

const apple = createAppleProvider({
  model: 'private-cloud-compute',
})
```

Call `apple.getModelInfo({ model: 'private-cloud-compute' })` before enabling
this path. It requires iOS 27 APIs and may report quota usage.

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

Image attachments are currently supported on the final user prompt. Passing
image parts on older OS versions throws `AppleLLMErrorCodes.UnsupportedOS`.

## Image Generation

Use the AI SDK image API with Apple's Image Playground framework:

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

The provider uses `ImageCreator` on iOS 26.4 and newer and returns PNG images.
Supported styles are `animation`, `illustration`, and `sketch`; iOS 27 adds
`any`, `emoji`, and `externalProvider`. Apple supports at most one source image
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
  `maxSteps`, `onStepStart`, and `onStepFinish` do not run for native Apple
  tool execution.
- Apple does not provide stable tool call IDs; the provider returns empty IDs.
- You can update the registered tools on a model instance with
  `model.updateTools(...)` before generation.

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

## Context Window

Apple's available context depends on the model and OS version. Prefer runtime
metadata over hard-coded values:

```typescript
const info = await apple.getModelInfo()
console.log(info.contextSize)
```

Use low-level token counting as an estimate, not a fit guarantee:

```typescript
import { AppleFoundationModels } from '@react-native-ai/apple'

const tokenCount = await AppleFoundationModels.countTokens(
  'Summarize this text in three bullet points.'
)
```

The full request also includes instructions, tool definitions, schema text,
attachments, and generated output budget. If Apple reports a context overflow,
trim or summarize and retry.

## Error Handling

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

For streaming, inspect `fullStream` when you need provider error parts:

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

for await (const part of result.fullStream) {
  if (part.type === 'error') {
    const error = part.error as AppleLLMError

    if (error.code === AppleLLMErrorCodes.ModelUnavailable) {
      // Show fallback UI.
    }
  }
}
```

Stable public codes are:

- `MODEL_UNAVAILABLE`
- `UNSUPPORTED_OS`
- `GENERATION_ERROR`
- `INVALID_MESSAGE`
- `CONFLICTING_SAMPLING_METHODS`
- `INVALID_SCHEMA`
- `TOOL_CALL_ERROR`
- `UNKNOWN_TOOL_CALL_ERROR`
- `CONTEXT_WINDOW_EXCEEDED`

## Direct Native API

Prefer the AI SDK models for generation. Use `AppleFoundationModels` only when
you need low-level native access:

```typescript
import { AppleFoundationModels } from '@react-native-ai/apple'

const info = await AppleFoundationModels.getModelInfo('en-US', 'system')
const tokens = await AppleFoundationModels.countTokens('A short prompt')
const result = await AppleFoundationModels.generateText(
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
