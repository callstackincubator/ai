# Llama Provider

## Quick Command

```bash
npm add @react-native-ai/llama llama.rn
```

```ts
import {llama, downloadModel} from '@react-native-ai/llama';
import {generateText} from 'ai';

const modelPath = await downloadModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf',
);
const model = llama.languageModel(modelPath);
await model.prepare();
const {text} = await generateText({model, prompt: 'Hello'});
```

## When to Use

- Run GGUF models from HuggingFace on-device
- Need embeddings, reranking, or speech (TTS) with GGUF
- Use llama.rn bindings for llama.cpp

## Prerequisites

- [ ] React Native >= 0.76.0
- [ ] llama.rn >= 0.10.0
- [ ] Vercel AI SDK v5+ (`ai`)
- [ ] Android or iOS

## Step-by-Step Instructions

### 1. Install

```bash
npm add @react-native-ai/llama llama.rn
```

### 2. Expo Setup (if using Expo)

Add to `app.json` / `app.config.js`:

```js
plugins: [
  [
    'llama.rn',
    {
      enableEntitlements: true,
      entitlementsProfile: 'production',
      forceCxx20: true,
      enableOpenCL: true,
    },
  ],
];
```

### 3. Model ID Format

Format: `owner/repo/filename.gguf`

Examples:

- `ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf`
- `Qwen/Qwen2.5-3B-Instruct-GGUF/qwen2.5-3b-instruct-q3_k_m.gguf`

### 4. Storage APIs

```ts
import {
  downloadModel,
  getModelPath,
  isModelDownloaded,
  removeModel,
  getDownloadedModels,
} from '@react-native-ai/llama';

// Download with progress
await downloadModel('owner/repo/model.gguf', (p) => console.log(p.percentage));

// Get path for existing model
const path = getModelPath('owner/repo/model.gguf');

// Check if downloaded
const exists = await isModelDownloaded('owner/repo/model.gguf');
```

### 5. Model Types

| Type      | Method                       | Notes                          |
| --------- | ---------------------------- | ------------------------------ |
| Language  | `llama.languageModel()`      | Text generation, chat          |
| Embedding | `llama.textEmbeddingModel()` | RAG, similarity                |
| Rerank    | `llama.rerankModel()`        | Document ranking               |
| Speech    | `llama.speechModel()`        | Requires `vocoderPath` in opts |

### 6. Lifecycle

```ts
await model.prepare(); // Load into memory
await model.unload(); // Release when done
```

## Common Pitfalls

- **Invalid model ID**: Must be `owner/repo/filename.gguf` (3+ parts).
- **Missing prepare()**: Call `prepare()` before generateText/streamText.
- **Expo**: Must add `llama.rn` plugin; refer to [llama.rn Expo docs](https://github.com/mybigday/llama.rn#expo).

## Related Skills

- [quick-start](quick-start.md)
- [apple-provider](apple-provider.md)
- [mlc-provider](mlc-provider.md)
