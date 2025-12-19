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

## Available Options

Configure model behavior with generation options:

- `temperature` (0-1): Controls randomness. Higher values = more creative, lower = more focused
- `maxTokens`: Maximum number of tokens to generate
- `topP` (0-1): Nucleus sampling threshold
- `topK`: Top-K sampling parameter

You can pass selected options with `generateText` or `streamText` as follows:

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
  prompt: 'Write a creative story',
  temperature: 0.8,
  maxTokens: 500,
  topP: 0.9,
})
```

## Model Configuration Options

When creating a model instance, you can configure llama.rn specific options:

```typescript
const model = llama.languageModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf',
  {
    n_ctx: 4096, // Context size (default: 2048)
    n_gpu_layers: 99, // Number of GPU layers (default: 99)
  }
)
```
