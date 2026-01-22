# Embeddings

Generate text embeddings for RAG (Retrieval-Augmented Generation), semantic search, and similarity comparisons using the Llama provider.

## Requirements

- An embedding-capable GGUF model (models trained for embeddings)
- Models must be downloaded and prepared before use

## Basic Usage

```typescript
import { llama, downloadModel } from '@react-native-ai/llama'
import { embed } from 'ai'

// Download embedding model - returns the file path
const modelPath = await downloadModel('owner/repo/embedding-model.gguf')

// Create embedding model with the path
const model = llama.textEmbeddingModel(modelPath)

await model.prepare()

// Generate embedding for a single text
const { embedding } = await embed({
  model,
  value: 'What is machine learning?',
})

console.log(embedding) // [0.123, -0.456, ...]
```

## Batch Embeddings

Generate embeddings for multiple texts:

```typescript
import { llama, downloadModel } from '@react-native-ai/llama'
import { embedMany } from 'ai'

const modelPath = await downloadModel('owner/repo/embedding-model.gguf')

const model = llama.textEmbeddingModel(modelPath)
await model.prepare()

const { embeddings } = await embedMany({
  model,
  values: [
    'Machine learning is a type of AI',
    'Deep learning uses neural networks',
    'Natural language processing handles text',
  ],
})

console.log(embeddings.length) // 3
console.log(embeddings[0].length) // Embedding dimension (e.g., 384, 768)
```

## Model Configuration

Configure the embedding model with specific options:

```typescript
const model = llama.textEmbeddingModel(modelPath, {
  normalize: -1, // Normalization mode (default: -1)
  contextParams: {
    n_ctx: 2048, // Context size (default: 2048)
    n_gpu_layers: 99, // GPU layers (default: 99)
    n_parallel: 8, // Parallel embeddings (default: 8)
  },
})
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `normalize` | number | -1 | Embedding normalization mode |
| `contextParams.n_ctx` | number | 2048 | Context window size |
| `contextParams.n_gpu_layers` | number | 99 | GPU layers for acceleration |
| `contextParams.n_parallel` | number | 8 | Number of parallel embeddings |

## Cleanup

Release resources when done:

```typescript
await model.unload() // Release from memory
```
