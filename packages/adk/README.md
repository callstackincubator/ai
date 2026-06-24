# ADK Provider for Vercel AI SDK

A Vercel AI SDK provider for [Google's Agent Development Kit (ADK)](https://developer.android.com/ai/adk) on Android. Build AI agents with tool calling, multi-turn sessions, and optional on-device Gemini Nano inference.

**Requirements:**

- Android `minSdkVersion` 26 or greater (required by ML Kit GenAI / Gemini Nano; set in your app, not only in this package)
- React Native New Architecture
- Vercel AI SDK v6

Consuming apps must set `minSdkVersion` to at least 26. ADK pulls in Google GenAI libraries that duplicate `META-INF/INDEX.LIST`; exclude it in your app packaging. For Expo:

```json
[
  "expo-build-properties",
  {
    "android": {
      "minSdkVersion": 26,
      "packagingOptions": {
        "exclude": ["META-INF/INDEX.LIST", "META-INF/DEPENDENCIES"]
      }
    }
  }
]
```

For bare React Native, add to `android/app/build.gradle`:

```gradle
android {
  packagingOptions {
    excludes += ["META-INF/INDEX.LIST", "META-INF/DEPENDENCIES"]
  }
}
```

Then run `npx expo prebuild --clean` so the native Android project picks up the change.

```ts
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

const model = adk.languageModel()

const { text } = await generateText({
  model,
  prompt: 'What time is it in New York?',
})
```

## Features

- Cloud Gemini agents via ADK `LlmAgent` and `InMemoryRunner`
- On-device Gemini Nano via ML Kit GenAI (`genai-nano` model type)
- Tool calling bridged to JavaScript executors
- Streaming responses with tool-call stream parts
- Post-generation token usage via ADK `UsageMetadata`
- Multimodal user prompts (text + inline images)
- Structured JSON output via ADK `GenerateContentConfig`
- Vercel AI SDK v6 `LanguageModelV3` provider

## Usage metadata

ADK returns token usage in response events (`promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`). The provider maps this into AI SDK `usage` on both `generateText` and streaming `finish` events.

## Multimodal input

Pass file parts in user messages using the standard AI SDK prompt format:

```ts
import { generateText } from 'ai'

const { text } = await generateText({
  model: adk.languageModel(),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        {
          type: 'file',
          mediaType: 'image/jpeg',
          data: base64Image,
        },
      ],
    },
  ],
})
```

## Structured output

Use AI SDK `responseFormat` with JSON schema. ADK maps this to `responseMimeType` and `responseSchema`:

```ts
import { generateObject } from 'ai'
import { z } from 'zod'

const { object } = await generateObject({
  model: adk.languageModel(),
  schema: z.object({
    summary: z.string(),
    sentiment: z.enum(['positive', 'neutral', 'negative']),
  }),
  prompt: 'Summarize this product review: ...',
})
```

Streaming structured JSON is not supported yet.

## Cloud Gemini

```ts
import { createAdkProvider } from '@react-native-ai/adk'
import { generateText } from 'ai'

const provider = createAdkProvider({
  apiKey: process.env.GOOGLE_API_KEY,
  modelName: 'gemini-2.5-flash',
  instruction: 'You are a helpful assistant.',
})

const model = provider.languageModel()

const { text } = await generateText({
  model,
  prompt: 'Summarize on-device AI in one sentence.',
})
```

> Do not embed API keys in production client apps. Prefer a backend proxy or secure runtime configuration.

## On-device Gemini Nano

Check device support before preparing or generating:

```ts
import { createAdkProvider, isADKNanoSupported } from '@react-native-ai/adk'

const supported = await isADKNanoSupported()
if (!supported) {
  // Device lacks Gemini Nano / AICore support
  return
}

const provider = createAdkProvider({
  modelType: 'genai-nano',
  modelName: 'gemini-nano',
})

const ready = await provider.isAvailable('genai-nano')
if (ready) {
  await provider.prepareNano()
}

const model = provider.languageModel()
```

- `isADKNanoSupported()` — device supports Nano (`checkStatus` ≠ 0). Does not download models.
- `isAvailable('genai-nano')` — Nano is ready or downloadable now (status 1 or 3).

## Tool calling

```ts
import { createAdkProvider } from '@react-native-ai/adk'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const getCurrentTime = tool({
  description: 'Get the current time for a city',
  inputSchema: z.object({
    city: z.string(),
  }),
  execute: async ({ city }) => ({
    city,
    time: new Date().toLocaleTimeString(),
  }),
})

const provider = createAdkProvider({
  apiKey: process.env.GOOGLE_API_KEY,
  availableTools: { getCurrentTime },
})

const { text } = await generateText({
  model: provider.languageModel(),
  tools: { getCurrentTime },
  prompt: 'What time is it in Warsaw?',
})
```

During streaming, the provider emits AI SDK `tool-input-*` and `tool-call` stream parts when ADK surfaces function calls from the model.

Pass tools through the AI SDK `tools` option as usual; the provider bridges execution to JavaScript while ADK orchestrates the agent loop natively.

## License

MIT
