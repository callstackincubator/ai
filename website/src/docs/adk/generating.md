# Generating

You can generate responses using ADK with the Vercel AI SDK's `generateText` or `streamText` functions. ADK orchestrates the agent loop natively on Android while the provider bridges tool execution and streaming back to JavaScript. Import the default provider, call `adk()` to construct a language model, and pass it to the AI SDK — the default export targets on-device Gemini Nano.

## Requirements

- **Physical Android device with AICore** - Required for Gemini Nano; the device must be capable of running Gemini Nano. Please consult the [ML Kit GenAI documentation](https://developers.google.com/ml-kit/genai#feature-device). We provide runtime checks for this capability - please refer to [Getting Started - On-device Gemini Nano](./getting-started.mdx#on-device-gemini-nano).
- **Polyfills** - Streaming requires `ReadableStream`; see [Polyfills](../polyfills.md)
- **Prepare Nano** - Call `prepareNano()` or `model.prepare()` before first on-device use (see [Getting Started - On-device Gemini Nano](./getting-started.mdx#on-device-gemini-nano))

## Text Generation

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

await adk.prepareNano()

const { text } = await generateText({
  model: adk(),
  prompt: 'Explain quantum computing in simple terms',
})
```

### Cloud Gemini

Cloud models use ADK's `LlmAgent` with Google's Gemini API. This is useful when Gemini Nano is unavailable, you need a more capable model, or you want to develop on an emulator without AICore. Create a provider with `modelType: 'gemini'` and an API key:

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

Cloud models do not require a separate download or prepare step.

> Do not embed API keys in production client apps. Prefer a backend proxy or secure runtime configuration.

## Streaming

Stream responses for real-time output:

```typescript
import { adk } from '@react-native-ai/adk'
import { streamText } from 'ai'

await adk.prepareNano()

const { textStream } = await streamText({
  model: adk(),
  prompt: 'Write a short story about a robot learning to paint',
})

for await (const delta of textStream) {
  console.log(delta)
}
```

During streaming, the provider emits standard AI SDK stream parts: `text-start`, `text-delta`, `text-end`, and `finish` with usage metadata.

## Usage Metadata

ADK returns token usage in response events (`promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`). The provider maps this into AI SDK `usage` on both `generateText` results and streaming `finish` events:

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

await adk.prepareNano()

const { usage } = await generateText({
  model: adk(),
  prompt: 'Count to five.',
})

console.log(usage.inputTokens.total) // promptTokenCount
console.log(usage.outputTokens.total) // candidatesTokenCount
console.log(usage.raw?.totalTokenCount)
```

## Tool Calling

Enable ADK agents to call JavaScript tools during generation. Works on both on-device Nano and cloud Gemini.

### Important ADK-Specific Behavior

Tools are orchestrated by ADK natively, which means:

- **Pre-register executors**: Pass tools to `createAdkProvider` via `availableTools` so ADK can invoke their `execute` handlers
- **Provider-executed**: Streamed tool calls are marked with `providerExecuted: true`
- **Native agent loop**: ADK runs the multi-turn tool loop; AI SDK `maxSteps` does not control ADK's internal iteration

### Setup

Pass tools to the AI SDK and call `adk()` as usual:

```typescript
import { adk } from '@react-native-ai/adk'
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

await adk.prepareNano()

const { text } = await generateText({
  model: adk(),
  tools: { getCurrentTime },
  prompt: 'What time is it in Warsaw?',
})
```

ADK also needs tool executors registered on the provider. Use `createAdkProvider` with `availableTools`:

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

await adk.prepareNano()

const { text } = await generateText({
  model: adk(),
  tools: { getCurrentTime },
  prompt: 'What time is it in Warsaw?',
})
```

During streaming, the provider emits `tool-input-start`, `tool-input-delta`, `tool-input-end`, and `tool-call` stream parts when ADK surfaces function calls from the model.

Pass tools through the AI SDK `tools` option as usual; the provider bridges execution to JavaScript while ADK orchestrates the agent loop natively.

### Updating Tools at Runtime

Register tools when creating the provider so ADK can execute them from JavaScript:

```typescript
import { adk } from '@react-native-ai/adk'

const model = adk()

// Add or replace tools on an existing model instance
model.updateTools({
  getCurrentTime,
})
```

To register executors at provider creation time:

```typescript
import { createAdkProvider } from '@react-native-ai/adk'
import { tool } from 'ai'
import { z } from 'zod'

const getCurrentTime = tool({
  description: 'Get the current time for a city',
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => ({
    city,
    time: new Date().toLocaleTimeString(),
  }),
})

const adk = createAdkProvider({
  availableTools: { getCurrentTime },
})

const model = adk()

model.updateTools({
  getCurrentTime,
})
```

## Multimodal Input

Pass file parts in user messages using the standard AI SDK prompt format:

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

await adk.prepareNano()

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

## Structured Output

Generate JSON responses using AI SDK JSON mode:

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

await adk.prepareNano()

const { text } = await generateText({
  model: adk(),
  prompt: 'Return a JSON object with name and age fields.',
  responseFormat: { type: 'json' },
})
```

> **Note**: JSON schema constraints (`responseFormat.schema`) are not supported yet. Use JSON mode without a schema, or parse and validate the response in your app.

Streaming structured JSON is not supported by ADK yet.

## Available Options

Configure model behavior with generation options:

| Option        | Type   | Description                                              |
| ------------- | ------ | -------------------------------------------------------- |
| `temperature` | number | Controls randomness                                      |
| `maxTokens`   | number | Maximum tokens to generate (`maxOutputTokens` in AI SDK) |
| `topP`        | number | Nucleus sampling threshold                               |
| `topK`        | number | Top-K sampling parameter                                 |

Example:

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

await adk.prepareNano()

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

The following features are not yet supported:

| Feature                            | Status                                       |
| ---------------------------------- | -------------------------------------------- |
| `responseFormat.schema`            | Not supported - use JSON mode without schema |
| Streaming JSON                     | Not supported                                |
| `toolChoice: { type: 'required' }` | Ignored with a warning - defaults to auto    |
| File URLs in multimodal prompts    | Not supported - use base64 or `Uint8Array`   |
| iOS / web                          | Android only                                 |
