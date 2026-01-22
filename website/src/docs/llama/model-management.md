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

### Discovering Downloaded Models

Get the list of models that have been downloaded to the device:

```typescript
import { LlamaEngine } from '@react-native-ai/llama'

const models = await LlamaEngine.getModels()

console.log('Downloaded models:', models)
// Output: [{ model_id: 'SmolLM3-Q4_K_M.gguf', path: '...', filename: '...', sizeBytes: 1800000000 }, ...]
```

### Creating Model Instances

Create model instances using the provider methods:

```typescript
import { llama } from '@react-native-ai/llama'

// Language model for text generation
const languageModel = llama.languageModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf'
)

// Embedding model for text embeddings
const embeddingModel = llama.textEmbeddingModel(
  'owner/repo/embedding-model.gguf'
)

// Speech model for text-to-speech (requires vocoder)
const speechModel = llama.speechModel(
  'owner/repo/tts-model.gguf',
  { vocoderPath: '/path/to/vocoder.gguf' }
)
```

With configuration options:

```typescript
const model = llama.languageModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf',
  {
    contextParams: {
      n_ctx: 4096, // Context window size (default: 2048)
      n_gpu_layers: 99, // GPU layers for acceleration (default: 99)
    },
  }
)
```

### Checking Download Status

Check if a model is already downloaded:

```typescript
// Using instance method
const isReady = await model.isDownloaded()

// Or using LlamaEngine
import { LlamaEngine } from '@react-native-ai/llama'
const isDownloaded = await LlamaEngine.isDownloaded(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf'
)
```

### Downloading Models

Models are downloaded from HuggingFace automatically:

```typescript
await model.download()

console.log('Download complete!')
```

You can track download progress:

```typescript
await model.download((progress) => {
  console.log(`Download: ${progress.percentage}%`)
})
```

### Preparing Models

After downloading, prepare the model for inference (loads it into memory):

```typescript
await model.prepare()
```

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

### Removing Downloaded Models

Delete downloaded model files to free storage:

```typescript
await model.remove()
```

## Custom Storage Path

By default, models are stored in `${DocumentDir}/llama-models/`. You can customize this:

```typescript
import { LlamaEngine } from '@react-native-ai/llama'

LlamaEngine.setStoragePath('/custom/path/to/models')
```

Or when creating the provider:

```typescript
import { createLlamaProvider } from '@react-native-ai/llama'

const llama = createLlamaProvider({
  storagePath: '/custom/path/to/models',
})
```

## API Reference

### `createLlamaProvider(options?)`

Creates a customized Llama provider instance.

- `options.storagePath`: Custom storage path for downloaded models

### `llama`

Default provider instance with the following methods:

### `llama.languageModel(modelId, options?)`

Creates a language model instance.

- `modelId`: Model identifier in format `owner/repo/filename.gguf`
- `options`:
  - `projectorPath`: Path to multimodal projector for vision/audio support
  - `projectorUseGpu`: Use GPU for multimodal processing (default: `true`)
  - `contextParams`: llama.rn context parameters
    - `n_ctx`: Context size (default: 2048, or 4096 for multimodal)
    - `n_gpu_layers`: Number of GPU layers (default: 99)

### `llama.textEmbeddingModel(modelId, options?)`

Creates an embedding model instance.

- `modelId`: Model identifier in format `owner/repo/filename.gguf`
- `options`:
  - `normalize`: Normalize embeddings (default: -1)
  - `contextParams`: llama.rn context parameters
    - `n_ctx`: Context size (default: 2048)
    - `n_gpu_layers`: Number of GPU layers (default: 99)
    - `n_parallel`: Parallel embeddings (default: 8)

### `llama.speechModel(modelId, options)`

Creates a speech model instance for text-to-speech.

- `modelId`: Model identifier in format `owner/repo/filename.gguf`
- `options`:
  - `vocoderPath`: **Required** - Path to vocoder model file
  - `vocoderBatchSize`: Batch size for vocoder processing
  - `contextParams`: llama.rn context parameters

### `LlamaEngine`

- `getModels()`: Get list of downloaded models
- `isDownloaded(modelId)`: Check if a model is downloaded
- `setStoragePath(path)`: Set custom storage directory

### Model Instance Methods

All model types share these common methods:

- `download(progressCallback?)`: Download model from HuggingFace
- `isDownloaded()`: Check if this model is downloaded
- `prepare()`: Initialize/load model into memory
- `getContext()`: Get the underlying LlamaContext (for advanced usage)
- `unload()`: Release model from memory
- `remove()`: Delete model from disk
