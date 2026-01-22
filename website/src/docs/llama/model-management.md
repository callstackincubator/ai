# Model Management

This guide covers the complete lifecycle of Llama models - from discovery and download to cleanup and removal.

## Finding Models

Unlike MLC which has a prebuilt set of models, the Llama provider can run any GGUF model from HuggingFace. You can browse available models at [HuggingFace GGUF Models](https://huggingface.co/models?library=gguf).

### Recommended Models

Here are some popular models that work well on mobile devices:

| Model ID                                                          | Size   | Best For                         |
| ----------------------------------------------------------------- | ------ | -------------------------------- |
| `ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf`                    | ~1.8GB | Balanced performance and quality |
| `Qwen/Qwen2.5-3B-Instruct-GGUF/qwen2.5-3b-instruct-q3_k_m.gguf`   | ~1.9GB | General conversations            |
| `lmstudio-community/gemma-2-2b-it-GGUF/gemma-2-2b-it-Q3_K_M.gguf` | ~2.3GB | High quality responses           |

> **Note**: When selecting models, consider quantization levels (Q3, Q4, Q5, etc.). Lower quantization = smaller size but potentially lower quality. Q4_K_M is a good balance for mobile.

## Model Lifecycle

### Downloading Models

Models are downloaded from HuggingFace using the storage API. The `downloadModel` function returns the path to the downloaded file:

```typescript
import { downloadModel } from '@react-native-ai/llama'

const modelPath = await downloadModel('ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf')

console.log('Downloaded to:', modelPath)
```

You can track download progress:

```typescript
const modelPath = await downloadModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf',
  (progress) => {
    console.log(`Download: ${progress.percentage}%`)
  }
)
```

### Checking Download Status

Check if a model is already downloaded:

```typescript
import { isModelDownloaded, getModelPath } from '@react-native-ai/llama'

const modelId = 'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf'

if (await isModelDownloaded(modelId)) {
  // Model already downloaded, get its path
  const modelPath = getModelPath(modelId)
}
```

### Creating Model Instances

Create model instances using the provider methods. Pass the model path (from `downloadModel()` or `getModelPath()`):

```typescript
import { llama, downloadModel } from '@react-native-ai/llama'

// Download and get the path
const modelPath = await downloadModel('ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf')

// Create model with the path
const languageModel = llama.languageModel(modelPath)

// Embedding model
const embeddingModel = llama.textEmbeddingModel(modelPath)

// Speech model (requires vocoder)
const speechModel = llama.speechModel(modelPath, {
  vocoderPath: '/path/to/vocoder.gguf'
})
```

With configuration options:

```typescript
const model = llama.languageModel(modelPath, {
  contextParams: {
    n_ctx: 4096, // Context window size (default: 2048)
    n_gpu_layers: 99, // GPU layers for acceleration (default: 99)
  },
})
```

### Preparing Models

After creating a model instance, prepare it for inference (loads it into memory):

```typescript
await model.prepare()
```

> [!TIP]
> Calling `prepare()` ahead of time is recommended for optimal performance. If not called, the model will auto-prepare when first used, but a warning will be logged.

### Using Models

Once prepared, use the model with AI SDK functions:

```typescript
import { streamText } from 'ai'

const { textStream } = streamText({
  model,
  prompt: 'Hello! Introduce yourself briefly.',
})

for await (const delta of textStream) {
  console.log(delta)
}
```

### Accessing the Native Context

For advanced usage, you can access the underlying `LlamaContext`:

```typescript
// Ensure the model is prepared before accessing the context
await model.prepare()

const context = model.getContext()

if (!context) {
  throw new Error(
    'Model context is not available. Make sure prepare() has completed and the model has not been unloaded.',
  )
}
```

### Unloading Models

Unload the model from memory to free resources:

```typescript
await model.unload()
```

## API Reference

### `llama`

Default provider instance with the following methods:

### `llama.languageModel(modelPath, options?)`

Creates a language model instance.

- `modelPath`: Path to the model file (from `downloadModel()` or `getModelPath()`)
- `options`:
  - `projectorPath`: Path to multimodal projector for vision/audio support
  - `projectorUseGpu`: Use GPU for multimodal processing (default: `true`)
  - `contextParams`: llama.rn context parameters
    - `n_ctx`: Context size (default: 2048, or 4096 for multimodal)
    - `n_gpu_layers`: Number of GPU layers (default: 99)

### `llama.textEmbeddingModel(modelPath, options?)`

Creates an embedding model instance.

- `modelPath`: Path to the model file (from `downloadModel()` or `getModelPath()`)
- `options`:
  - `normalize`: Normalize embeddings (default: -1)
  - `contextParams`: llama.rn context parameters
    - `n_ctx`: Context size (default: 2048)
    - `n_gpu_layers`: Number of GPU layers (default: 99)
    - `n_parallel`: Parallel embeddings (default: 8)

### `llama.speechModel(modelPath, options)`

Creates a speech model instance for text-to-speech.

- `modelPath`: Path to the model file (from `downloadModel()` or `getModelPath()`)
- `options`:
  - `vocoderPath`: **Required** - Path to vocoder model file
  - `vocoderBatchSize`: Batch size for vocoder processing
  - `contextParams`: llama.rn context parameters

### Storage Functions

These functions are exported directly for model management. Models are stored in `${DocumentDir}/llama-models/`.

### `downloadModel(modelId, progressCallback?)`

Download a model from HuggingFace.

- `modelId`: Model identifier in format `owner/repo/filename.gguf`
- `progressCallback`: Optional callback with `{ percentage: number }`
- Returns: `Promise<string>` - Path to the downloaded model file

### `getModelPath(modelId)`

Get the local file path for a model (without downloading).

- `modelId`: Model identifier in format `owner/repo/filename.gguf`
- Returns: `string` - Path where the model file is/would be stored

### `isModelDownloaded(modelId)`

Check if a model is downloaded.

- `modelId`: Model identifier in format `owner/repo/filename.gguf`
- Returns: `Promise<boolean>`

### Model Instance Methods

All model types share these common methods:

- `prepare()`: Initialize/load model into memory
- `getContext()`: Get the underlying LlamaContext (for advanced usage)
- `unload()`: Release model from memory
