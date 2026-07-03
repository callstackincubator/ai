# ADK Provider for Vercel AI SDK

A Vercel AI SDK provider for [Google's Agent Development Kit (ADK)](https://developer.android.com/ai/adk) on Android. Use Gemini Nano and cloud Gemini on Android with tool calling, multi-turn sessions, and optional on-device Gemini Nano inference.

**Requirements:**

- Android `minSdkVersion` 26 or greater (required by ML Kit GenAI / Gemini Nano; set in your app, not only in this package)
- React Native New Architecture
- Vercel AI SDK v6
- If using on-device models: a device capable of running Gemini Nano (Android 14+ with AICore); you can consult the [ML Kit GenAI documentation](https://developers.google.com/ml-kit/genai#feature-device) for more details.

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

const { text } = await generateText({
  model: adk(),
  prompt: 'What time is it in New York?',
})
```

## Features

- Cloud Gemini model via ADK `LlmAgent` and `InMemoryRunner`
- On-device Gemini Nano via ML Kit GenAI (`genai-nano` model type)
- Tool calling bridged to JavaScript executors
- Streaming responses with tool-call stream parts
- Post-generation token usage via ADK `UsageMetadata`
- Multimodal user prompts (text + inline images)
- Structured JSON output via `responseMimeType` (schema constraints not yet supported)
- Vercel AI SDK v6 `LanguageModelV3` provider

## Usage metadata

ADK returns token usage in response events (`promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`). The provider maps this into AI SDK `usage` on both `generateText` and streaming `finish` events.

## Multimodal input

Pass file parts in user messages using the standard AI SDK prompt format:

```ts
import { generateText } from 'ai'

const { text } = await generateText({
  model: adk(),
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

Streaming structured JSON is not supported by ADK yet.

## Cloud Gemini

```ts
import { createAdkProvider } from '@react-native-ai/adk'
import { generateText } from 'ai'

const adk = createAdkProvider({
  apiKey: process.env.GOOGLE_API_KEY,
  modelName: 'gemini-2.5-flash',
  instruction: 'You are a helpful assistant.',
})

const { text } = await generateText({
  model: adk(),
  prompt: 'Summarize on-device AI in one sentence.',
})
```

> Do not embed API keys in production client apps. Prefer a backend proxy or secure runtime configuration.

## On-device Gemini Nano

Gemini Nano has two separate availability checks:

| API                             | Label                 | Question                                   |
| ------------------------------- | --------------------- | ------------------------------------------ |
| `adk.isNanoSupported()`         | **Device capability** | Can this device ever run Nano?             |
| `adk.isAvailable('genai-nano')` | **Runtime readiness** | Can I call `prepareNano()` / generate now? |

If `isNanoSupported()` is `false`, `isAvailable('genai-nano')` is also `false`.

### ML Kit status codes

Both checks use ML Kit `Generation.getClient().checkStatus()`:

| Status         | `isNanoSupported()` | `isAvailable('genai-nano')` | Suggested UX                             |
| -------------- | ------------------- | --------------------------- | ---------------------------------------- |
| `0`            | `false`             | `false`                     | Hide or disable — not supported          |
| `1`            | `true`              | `true`                      | Ready — call `prepareNano()`             |
| `3`            | `true`              | `true`                      | Ready to download — call `prepareNano()` |
| Other non-zero | `true`              | `false`                     | Show disabled — not ready yet            |

See [ML Kit GenAI Prompt API](https://developers.google.com/ml-kit/genai) for details.

### Recommended flow

```ts
import { createAdkProvider } from '@react-native-ai/adk'

const adk = createAdkProvider({
  modelType: 'genai-nano',
  modelName: 'gemini-nano',
})

const supported = await adk.isNanoSupported()
if (!supported) {
  // Device lacks Gemini Nano / AICore support — hide from model picker
  return
}

const ready = await adk.isAvailable('genai-nano')
if (!ready) {
  // Device supports Nano but ML Kit is not ready yet (e.g. downloading)
  // Show disabled — do not mark as "Ready"
  return
}

await adk.prepareNano()
const model = adk()
```

Both checks are cheap native calls (no model download). Safe to cache at app startup and re-check after resume.

> **Note:** `model.prepare()`, `generateText()`, and `streamText()` auto-call `prepareNano()` for `genai-nano` models, but only gate on `isNanoSupported()`. For UI gating, always use `isAvailable('genai-nano')` and handle prepare/generation errors in your chat flow.

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

const adk = createAdkProvider({
  apiKey: process.env.GOOGLE_API_KEY,
  availableTools: { getCurrentTime },
})

const { text } = await generateText({
  model: adk(),
  tools: { getCurrentTime },
  prompt: 'What time is it in Warsaw?',
})
```

During streaming, the provider emits AI SDK `tool-input-*` and `tool-call` stream parts when ADK surfaces function calls from the model.

Pass tools through the AI SDK `tools` option as usual; the provider bridges execution to JavaScript while ADK orchestrates the agent loop natively.

## License

MIT
