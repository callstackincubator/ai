# Generating

You can generate responses using ADK with the Vercel AI SDK's `generateText` or `streamText` functions. ADK runs the agent loop natively on Android, and the provider bridges tool execution and streaming back to JavaScript. The default `adk` provider targets on-device Gemini Nano.

## Requirements

- **Physical Android device with AICore** - Required for Gemini Nano. See [Getting Started - Availability](./getting-started.mdx#availability) for the runtime checks
- **Polyfills** - Streaming requires `ReadableStream`; see [Polyfills](../polyfills.md)

## Text Generation

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

const { text } = await generateText({
  model: adk(),
  prompt: 'Explain quantum computing in simple terms',
})
```

The first call prepares Gemini Nano. To prepare it ahead of time, call `adk.prepareNano()` (see [Getting Started - Preparation](./getting-started.mdx#preparation)).

### Cloud Gemini

Cloud models use ADK's `LlmAgent` with the Gemini API. They are useful when Gemini Nano is unavailable, when you need a more capable model, or when you develop on an emulator without AICore. Create a provider with `modelType: 'gemini'`, a `modelName`, and an API key:

```typescript
import { createAdkProvider } from '@react-native-ai/adk'
import { generateText } from 'ai'

const adk = createAdkProvider({
  modelType: 'gemini',
  modelName: 'gemini-2.5-flash',
  apiKey: process.env.GOOGLE_API_KEY,
})

const { text } = await generateText({
  model: adk(),
  prompt: 'Explain quantum computing in simple terms',
})
```

> Do not embed API keys in production client apps. Prefer a backend proxy or secure runtime configuration.

## Streaming

Stream responses for real-time output:

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

The provider emits standard AI SDK stream parts: `text-start`, `text-delta`, `text-end`, and `finish` with token usage.

## Token Usage

ADK reports token usage as `promptTokenCount`, `candidatesTokenCount`, and `totalTokenCount`. The provider maps these to AI SDK `usage` on `generateText` results and on the streaming `finish` part:

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

const { usage } = await generateText({
  model: adk(),
  prompt: 'Count to five.',
})

console.log(usage.inputTokens) // promptTokenCount
console.log(usage.outputTokens) // candidatesTokenCount
console.log(usage.raw?.totalTokenCount)
```

## Tool Calling

ADK agents can call JavaScript tools during generation, on both Gemini Nano and cloud Gemini.

### ADK-Specific Behavior

ADK runs tools natively, which differs from other providers:

- **Register executors on the provider** - Pass tools to `createAdkProvider` via `availableTools` so ADK can call their `execute` handlers. Tools passed only to `generateText` or `streamText` are described to the model but never executed
- **Provider-executed** - Streamed tool calls are marked with `providerExecuted: true`
- **Native agent loop** - ADK runs the multi-step tool loop, so AI SDK `stopWhen` does not limit ADK's internal steps
- **Gemini Nano** - Gemini Nano has no native function calling. The provider lists the tools in the system instruction and converts the model's `tool_code` blocks into ADK function calls

### Setup

Register the tools on the provider with `availableTools`, and pass the same tools to the AI SDK:

```typescript
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
  availableTools: { getCurrentTime },
})

const { text } = await generateText({
  model: adk(),
  tools: { getCurrentTime },
  prompt: 'What time is it in Warsaw?',
})
```

During streaming, the provider emits `tool-input-start`, `tool-input-delta`, `tool-input-end`, and `tool-call` stream parts when ADK surfaces function calls from the model.

## Image Prompts

Pass image file parts in user messages using the standard AI SDK prompt format:

```typescript
import { adk } from '@react-native-ai/adk'
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

Supported file data formats:

- **Base64 strings** - Raw base64 or `data:image/jpeg;base64,...` data URLs
- **`Uint8Array`** - Binary image data

> **Note**: File URLs (`file://` or HTTP) are not supported yet. Pass base64 or `Uint8Array` data directly.

## JSON Output

Generate JSON with `Output.json()`:

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText, Output } from 'ai'

const { output } = await generateText({
  model: adk(),
  output: Output.json(),
  prompt: 'Return a JSON object with name and age fields.',
})
```

> **Note**: Schema constraints are not supported yet, so `Output.object()` and other schema-based outputs throw. Use `Output.json()` and validate the result in your app. JSON output is not supported with `streamText`.

## Available Options

Configure model behavior with generation options:

| Option            | Type   | Description                |
| ----------------- | ------ | -------------------------- |
| `temperature`     | number | Controls randomness        |
| `maxOutputTokens` | number | Maximum tokens to generate |
| `topP`            | number | Nucleus sampling threshold |
| `topK`            | number | Top-K sampling parameter   |

Example:

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

const { text } = await generateText({
  model: adk(),
  prompt: 'Write a creative story',
  temperature: 0.8,
  maxOutputTokens: 500,
  topP: 0.9,
  topK: 40,
})
```

## Limitations

The following features are not supported yet:

| Feature                                    | Status                                      |
| ------------------------------------------ | ------------------------------------------- |
| Schema-constrained output                  | Throws - use `Output.json()` without schema |
| JSON output with `streamText`              | Throws                                      |
| `toolChoice` `required` or a specific tool | Ignored with an AI SDK warning - uses auto  |
| `reasoning`                                | Ignored with an AI SDK warning              |
| File URLs in prompts                       | Throws - use base64 or `Uint8Array`         |
| iOS / web                                  | Android only                                |
