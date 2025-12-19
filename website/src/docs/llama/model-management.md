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

### Creating Model Instance

Create a model instance using the `llama.languageModel()` method:

```typescript
import { llama } from '@react-native-ai/llama'

const model = llama.languageModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf'
)
```

With configuration options:

```typescript
const model = llama.languageModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf',
  {
    n_ctx: 4096, // Context window size (default: 2048)
    n_gpu_layers: 99, // GPU layers for acceleration (default: 99)
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

## API Reference

### `llama.languageModel(modelId, options?)`

Creates a language model instance.

- `modelId`: Model identifier in format `owner/repo/filename.gguf`
- `options`:
  - `n_ctx`: Context size (default: 2048)
  - `n_gpu_layers`: Number of GPU layers (default: 99)
  - `contextParams`: Additional llama.rn context parameters

### `LlamaEngine`

- `getModels()`: Get list of downloaded models
- `isDownloaded(modelId)`: Check if a model is downloaded
- `setStoragePath(path)`: Set custom storage directory

### Model Instance Methods

- `download(progressCallback?)`: Download model from HuggingFace
- `isDownloaded()`: Check if this model is downloaded
- `prepare()`: Initialize/load model into memory
- `unload()`: Release model from memory
- `remove()`: Delete model from disk
