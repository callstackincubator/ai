# Generating

You can generate responses using Llama models with the Vercel AI SDK's `generateText` or `streamText` functions.

## Requirements

- Models must be downloaded and prepared before use
- Sufficient device storage for model files (typically 1-4GB per model depending on quantization)

## Text Generation

```typescript
import { llama } from '@react-native-ai/llama'
import { generateText } from 'ai'

// Create and prepare model
const model = llama.languageModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf'
)
await model.download()
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
import { llama } from '@react-native-ai/llama'
import { streamText } from 'ai'

// Create and prepare model
const model = llama.languageModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf'
)
await model.download()
await model.prepare()

const { textStream } = streamText({
  model,
  prompt: 'Write a short story about a robot learning to paint',
})

for await (const delta of textStream) {
  console.log(delta)
}
```

## Multimodal (Vision & Audio)

The Llama provider supports multimodal models that can process images and audio. To enable multimodal capabilities, provide a `projectorPath` when creating the model:

```typescript
import { llama } from '@react-native-ai/llama'
import { generateText } from 'ai'

const model = llama.languageModel(
  'owner/repo/vision-model.gguf',
  {
    projectorPath: '/path/to/mmproj-model.gguf',
  }
)

await model.download()
await model.prepare()

// Use with images
const result = await generateText({
  model,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What do you see in this image?' },
        {
          type: 'file',
          mediaType: 'image/jpeg',
          data: 'file:///path/to/image.jpg', // or base64 data URL
        },
      ],
    },
  ],
})
```

### Supported Formats

- **Images**: JPEG, PNG, BMP, GIF, TGA, HDR, PIC, PNM
- **Audio**: WAV, MP3

### Supported URL Patterns

- `file://` - Local file paths
- `data:` - Base64 data URLs

> **Note**: HTTP URLs are not yet supported. Use local files or base64 data URLs.

## Reasoning Models

Models that support reasoning (like DeepSeek-R1) automatically handle `<think>` tags. The reasoning content is separated from the main response:

```typescript
import { llama } from '@react-native-ai/llama'
import { generateText } from 'ai'

const model = llama.languageModel(
  'owner/repo/deepseek-r1.gguf'
)
await model.download()
await model.prepare()

const result = await generateText({
  model,
  prompt: 'Solve this math problem step by step: 2x + 5 = 13',
})

// Access main response
console.log(result.text)

// Access reasoning content (if present)
console.log(result.reasoning)
```

When streaming, reasoning tokens are emitted separately via `reasoning-start`, `reasoning-delta`, and `reasoning-end` events.

## JSON Mode

Generate structured JSON responses:

```typescript
import { llama } from '@react-native-ai/llama'
import { generateObject } from 'ai'
import { z } from 'zod'

const model = llama.languageModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf'
)
await model.download()
await model.prepare()

const { object } = await generateObject({
  model,
  schema: z.object({
    name: z.string(),
    age: z.number(),
    hobbies: z.array(z.string()),
  }),
  prompt: 'Generate a fictional person profile',
})

console.log(object)
// { name: 'Alice', age: 28, hobbies: ['reading', 'hiking'] }
```

## Available Options

Configure model behavior with generation options:

| Option | Type | Description |
| --- | --- | --- |
| `temperature` | number (0-1) | Controls randomness. Higher = more creative |
| `maxTokens` | number | Maximum tokens to generate |
| `topP` | number (0-1) | Nucleus sampling threshold |
| `topK` | number | Top-K sampling parameter |
| `presencePenalty` | number | Penalize tokens based on presence |
| `frequencyPenalty` | number | Penalize tokens based on frequency |
| `stopSequences` | string[] | Stop generation at these sequences |
| `seed` | number | Random seed for reproducibility |

Example with all options:

```typescript
import { llama } from '@react-native-ai/llama'
import { generateText } from 'ai'

const model = llama.languageModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf'
)
await model.download()
await model.prepare()

const result = await generateText({
  model,
  prompt: 'Write a creative story',
  temperature: 0.8,
  maxTokens: 500,
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
const model = llama.languageModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf',
  {
    contextParams: {
      n_ctx: 4096, // Context size (default: 2048, or 4096 for multimodal)
      n_gpu_layers: 99, // Number of GPU layers (default: 99)
    },
  }
)
```

For multimodal models:

```typescript
const model = llama.languageModel(
  'owner/repo/vision-model.gguf',
  {
    projectorPath: '/path/to/mmproj.gguf', // Required for multimodal
    projectorUseGpu: true, // Use GPU for multimodal (default: true)
    contextParams: {
      n_ctx: 4096,
      n_gpu_layers: 99,
    },
  }
)
```
