# ADK Provider for Vercel AI SDK

A Vercel AI SDK provider for [Google's Agent Development Kit (ADK)](https://developer.android.com/ai/adk) on Android. Build AI agents with tool calling, multi-turn sessions, and optional on-device Gemini Nano inference.

**Requirements:**

- Android API 24+
- React Native New Architecture
- Vercel AI SDK v6

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
- Streaming responses
- Vercel AI SDK v6 `LanguageModelV3` provider

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

```ts
import { createAdkProvider } from '@react-native-ai/adk'

const provider = createAdkProvider({
  modelType: 'genai-nano',
  modelName: 'gemini-nano',
})

const available = await provider.isAvailable('genai-nano')
if (available) {
  await provider.prepareNano()
}

const model = provider.languageModel()
```

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

Pass tools through the AI SDK `tools` option as usual; the provider bridges execution to JavaScript while ADK orchestrates the agent loop natively.

## License

MIT
