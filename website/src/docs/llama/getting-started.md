# Getting Started

The Llama provider enables you to run GGUF models directly on-device in React Native applications using [llama.rn](https://github.com/mybigday/llama.rn). This allows you to download and run any GGUF model from HuggingFace for privacy, performance, and offline capabilities.

## Installation

Install the Llama provider and its peer dependencies:

```bash
npm install @react-native-ai/llama llama.rn
```

While you can use the Llama provider standalone, we recommend using it with the Vercel AI SDK for a much better developer experience. The AI SDK provides unified APIs, streaming support, and advanced features. To use with the AI SDK, you'll need v5 and [required polyfills](../polyfills.md):

```bash
npm install ai
```

## Requirements

- **React Native >= 0.76.0** - Required for native module functionality
- **llama.rn >= 0.10.0** - The underlying llama.cpp bindings

## Expo Setup

For use with the Expo framework and CNG builds, you will need `expo-build-properties` to utilize iOS and OpenCL features. Simply add the following to your `app.json` or `app.config.js` file:

```javascript
module.exports = {
  expo: {
    // ...
    plugins: [
      // ...
      [
        'llama.rn',
        // optional fields, below are the default values
        {
          enableEntitlements: true,
          entitlementsProfile: 'production',
          forceCxx20: true,
          enableOpenCL: true,
        },
      ],
    ],
  },
}
```

For all other installation tips and tricks, refer to the [llama.rn Expo documentation](https://github.com/mybigday/llama.rn?tab=readme-ov-file#expo).

## Available Model Types

The Llama provider supports multiple model types:

| Model Type | Method | Use Case |
| --- | --- | --- |
| Language Model | `llama.languageModel()` | Text generation, chat, reasoning |
| Embedding Model | `llama.textEmbeddingModel()` | Text embeddings for RAG, similarity |
| Speech Model | `llama.speechModel()` | Text-to-speech with vocoder |

## Basic Usage

Import the Llama provider and use it with the AI SDK:

```typescript
import { llama, downloadModel } from '@react-native-ai/llama'
import { streamText } from 'ai'

// Download model from HuggingFace - returns the file path
const modelPath = await downloadModel('ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf')

// Create model instance with the path
const model = llama.languageModel(modelPath)

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
- **[Generating](./generating.md)** - Learn how to generate text, use multimodal inputs, and stream responses
- **[Embeddings](./embeddings.md)** - Generate text embeddings for RAG and similarity search
