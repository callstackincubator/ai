# Getting Started

The Llama provider enables you to run GGUF models directly on-device in React Native applications using [llama.rn](https://github.com/mybigday/llama.rn). This allows you to download and run any GGUF model from HuggingFace for privacy, performance, and offline capabilities.

## Installation

Install the Llama provider and its peer dependencies:

```bash
npm install @react-native-ai/llama llama.rn react-native-blob-util
```

While you can use the Llama provider standalone, we recommend using it with the Vercel AI SDK for a much better developer experience. The AI SDK provides unified APIs, streaming support, and advanced features. To use with the AI SDK, you'll need v5 and [required polyfills](../polyfills.md):

```bash
npm install ai
```

## Requirements

- **React Native >= 0.76.0** - Required for native module functionality
- **llama.rn >= 0.10.0** - The underlying llama.cpp bindings

## Basic Usage

Import the Llama provider and use it with the AI SDK:

```typescript
import { llama } from '@react-native-ai/llama'
import { streamText } from 'ai'

// Create model instance (Model ID format: "owner/repo/filename.gguf")
const model = llama.languageModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf'
)

// Download from HuggingFace
await model.download()

// Initialize model (loads into memory)
await model.prepare()

const { textStream } = streamText({
  model,
  prompt: 'Explain quantum computing in simple terms',
})

for await (const delta of textStream) {
  console.log(delta)
}

// Cleanup when done
await model.unload()
```

## Model ID Format

Models are identified using the HuggingFace format: `owner/repo/filename.gguf`

For example:

- `ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf`
- `Qwen/Qwen2.5-3B-Instruct-GGUF/qwen2.5-3b-instruct-q3_k_m.gguf`
- `lmstudio-community/gemma-2-2b-it-GGUF/gemma-2-2b-it-Q3_K_M.gguf`

You can find GGUF models on [HuggingFace](https://huggingface.co/models?library=gguf).

## Next Steps

- **[Model Management](./model-management.md)** - Complete guide to model lifecycle, downloading, and API reference
- **[Generating](./generating.md)** - Learn how to generate text and stream responses
