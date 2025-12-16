# @react-native-ai/llama-rn

llama.rn provider for Vercel AI SDK - run GGUF models on-device in React Native.

## Installation

```bash
npm install @react-native-ai/llama-rn llama.rn
```

## Usage

```typescript
import { llamaRn, LlamaRnEngine } from '@react-native-ai/llama-rn'

// List downloaded models
const models = await LlamaRnEngine.getModels()

// Create model instance
// Model ID format: "owner/repo/filename.gguf"
const model = llamaRn.languageModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf',
  {
    n_ctx: 2048,
    n_gpu_layers: 99,
  }
)

// Download from HuggingFace (with progress)
await model.download((progress) => {
  console.log(`Downloading: ${progress.percentage}%`)
})

// Initialize model (loads into memory)
await model.prepare()

// Access underlying LlamaContext for direct usage
const context = model.getContext()
const result = await context.completion({
  messages: [{ role: 'user', content: 'Hello!' }],
  n_predict: 100,
})

// Cleanup
await model.unload()

// Remove from disk
await model.remove()
```

## API

### `llamaRn.languageModel(modelId, options?)`

Creates a language model instance.

- `modelId`: Model identifier in format `owner/repo/filename.gguf`
- `options`:
  - `n_ctx`: Context size (default: 2048)
  - `n_gpu_layers`: Number of GPU layers (default: 99)
  - `contextParams`: Additional llama.rn context parameters

### `LlamaRnEngine`

- `getModels()`: Get list of downloaded models
- `isDownloaded(modelId)`: Check if a model is downloaded
- `setStoragePath(path)`: Set custom storage directory

### Model Instance Methods

- `download(progressCallback?)`: Download model from HuggingFace
- `isDownloaded()`: Check if this model is downloaded
- `prepare()`: Initialize/load model into memory
- `getContext()`: Get underlying LlamaContext
- `unload()`: Release model from memory
- `remove()`: Delete model from disk

## Requirements

- React Native >= 0.76.0
- llama.rn >= 0.10.0-rc.0
