# Generating

You can generate responses using Llama models with the Vercel AI SDK's `generateText` or `streamText` functions.

## Requirements

- Models must be downloaded and prepared before use
- Sufficient device storage for model files (typically 1-4GB per model depending on quantization)

## Text Generation

```typescript
import { llama, downloadModel } from '@react-native-ai/llama'
import { generateText } from 'ai'

// Download model - returns the file path
const modelPath = await downloadModel('bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf')

const model = llama.languageModel(modelPath)
await model.prepare()

const result = await generateText({
  model,
  prompt: 'Explain quantum computing in simple terms',
})

console.log(result.text)
```

## Streaming

Stream responses for real-time output:

```typescript
import { llama, downloadModel } from '@react-native-ai/llama'
import { streamText } from 'ai'

// Download model - returns the file path
const modelPath = await downloadModel('bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf')

const model = llama.languageModel(modelPath)
await model.prepare()

const { textStream } = streamText({
  model,
  prompt: 'Write a short story about a robot learning to paint',
})

for await (const delta of textStream) {
  console.log(delta)
}
```

## Tool Calling

You can enable tool calling for both `generateText` and `streamText` by passing tools to the AI SDK.

### Setup

Define tools using the AI SDK `tool` helper:

```typescript
import { tool } from 'ai'
import { z } from 'zod'

const getWeather = tool({
  description: 'Get current weather information',
  inputSchema: z.object({
    city: z.string(),
  }),
  execute: async ({ city }) => {
    return `Weather in ${city}: Sunny, 25°C`
  },
})
```

### Basic Tool Usage

```typescript
import { llama, downloadModel } from '@react-native-ai/llama'
import { generateText } from 'ai'

const modelPath = await downloadModel('Qwen/Qwen2.5-3B-Instruct-GGUF/qwen2.5-3b-instruct-q3_k_m.gguf')

const model = llama.languageModel(modelPath)
await model.prepare()

const result = await generateText({
  model,
  prompt: 'What is the weather in Paris?',
  tools: {
    getWeather,
  },
})
```

## Multimodal (Vision & Audio)

Multimodal models take images and, for some models, audio. They ship as two files: the model and a multimodal projector (`mmproj`). Pass the projector as `projectorPath`:

```typescript
import { llama, downloadModel } from '@react-native-ai/llama'
import { generateText } from 'ai'

// Gemma 4 E2B reads images and audio, and supports reasoning and tool calling
const modelPath = await downloadModel(
  'ggml-org/gemma-4-E2B-it-GGUF/gemma-4-E2B-it-Q4_0.gguf'
)
const projectorPath = await downloadModel(
  'ggml-org/gemma-4-E2B-it-GGUF/mmproj-gemma-4-E2B-it-Q8_0.gguf'
)

const model = llama.languageModel(modelPath, { projectorPath })
await model.prepare()

const result = await generateText({
  model,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What do you see in this image?' },
        { type: 'image', image: new URL('file:///path/to/image.jpg') },
      ],
    },
  ],
})
```

Images can also be passed as a `Uint8Array` or a base64 string with a `mediaType`. Audio goes in a `file` part:

```typescript
{ type: 'file', mediaType: 'audio/wav', data: new URL('file:///path/to/clip.wav') }
```

Smaller vision models with reasoning, such as `bartowski/Qwen_Qwen3.5-2B-GGUF` (with `mmproj-Qwen_Qwen3.5-2B-f16.gguf`), work the same way.

### Supported Formats

- **Images**: JPEG, PNG, BMP, GIF, TGA, HDR, PIC, PNM
- **Audio**: WAV, MP3

Local `file://` URLs and in-memory data are read on device. Remote `http(s)` URLs are downloaded by the AI SDK before the call. Other file types (for example PDFs) throw an `UnsupportedFunctionalityError`.

## Reasoning

Reasoning models (Qwen3.5, Gemma 4, DeepSeek-R1 and others) return their thinking separately from the answer:

```typescript
const result = await generateText({
  model,
  prompt: 'Solve this math problem step by step: 2x + 5 = 13',
})

console.log(result.text) // the answer
console.log(result.reasoningText) // the thinking, if the model produced any
```

When streaming, reasoning is emitted as `reasoning-start`, `reasoning-delta` and `reasoning-end` parts.

Use the AI SDK `reasoning` option to control how much the model thinks:

| `reasoning` | Effect |
| --- | --- |
| `'provider-default'` (default) | The chat template decides, most reasoning models think |
| `'none'` | Thinking is turned off (`enable_thinking: false`) |
| `'minimal'` to `'max'` | Thinking is on, capped at a token budget: 2% to 95% of `maxOutputTokens`, or of the context size when `maxOutputTokens` is not set, and at least 1024 tokens |

```typescript
const result = await generateText({
  model,
  prompt: 'What is the capital of France?',
  reasoning: 'none',
})
```

`providerOptions.llama` takes precedence, so you can set llama.rn params such as `enable_thinking` or `thinking_budget_tokens` directly.

## Structured Output

Generate JSON that matches a schema with `Output.object`. The schema is compiled into a grammar, so the model can only produce valid JSON:

```typescript
import { generateText, Output } from 'ai'
import { z } from 'zod'

const { output } = await generateText({
  model,
  output: Output.object({
    schema: z.object({
      name: z.string(),
      age: z.number(),
      hobbies: z.array(z.string()),
    }),
  }),
  prompt: 'Generate a fictional person profile',
})

console.log(output)
// { name: 'Alice', age: 28, hobbies: ['reading', 'hiking'] }
```

Thinking is turned off for structured output, since llama.rn cannot combine a
grammar with it, and an explicit `reasoning` level returns an `unsupported`
warning.

## Available Options

Configure model behavior with generation options:

| Option | Type | Description |
| --- | --- | --- |
| `temperature` | number (0-1) | Controls randomness. Higher = more creative |
| `maxOutputTokens` | number | Maximum tokens to generate |
| `topP` | number (0-1) | Nucleus sampling threshold |
| `topK` | number | Top-K sampling parameter |
| `presencePenalty` | number | Penalize tokens based on presence |
| `frequencyPenalty` | number | Penalize tokens based on frequency |
| `stopSequences` | string[] | Stop generation at these sequences |
| `seed` | number | Random seed for reproducibility |

Example with all options:

```typescript
import { llama, downloadModel } from '@react-native-ai/llama'
import { generateText } from 'ai'

const modelPath = await downloadModel('bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf')

const model = llama.languageModel(modelPath)
await model.prepare()

const result = await generateText({
  model,
  prompt: 'Write a creative story',
  temperature: 0.8,
  maxOutputTokens: 500,
  topP: 0.9,
  topK: 40,
  presencePenalty: 0.5,
  frequencyPenalty: 0.5,
  stopSequences: ['THE END'],
  seed: 42,
})
```

## Model Configuration Options

When creating a model instance, you can configure llama.rn specific options via `contextParams`:

```typescript
const model = llama.languageModel(modelPath, {
  contextParams: {
    n_ctx: 4096, // Context size (default: 2048, or 4096 for multimodal)
    n_gpu_layers: 99, // Number of GPU layers (default: 99)
  },
})
```

:::tip Long conversations
The whole chat must fit in `n_ctx`. To keep a rolling window and summarize
older messages, wrap the model with `wrapLanguageModelWithHistory`, which
counts tokens with the model's tokenizer. See
[Conversation History](../history.md).
:::

For multimodal models:

```typescript
const model = llama.languageModel(modelPath, {
  projectorPath: '/path/to/mmproj.gguf', // Required for multimodal
  projectorUseGpu: true, // Use GPU for multimodal (default: true)
  contextParams: {
    n_ctx: 4096,
    n_gpu_layers: 99,
  },
})
```
