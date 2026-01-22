# Reranking

Rank documents based on their relevance to a query using the Llama provider. This is useful for improving search results and implementing retrieval-augmented generation (RAG) systems.

## Requirements

- A reranker GGUF model (models trained for ranking)
- Models must be downloaded and prepared before use

## Basic Usage

```typescript
import { llama, downloadModel } from '@react-native-ai/llama'
import { rerank } from 'ai'

// Download reranker model - returns the file path
const modelPath = await downloadModel('jinaai/jina-reranker-v2-base-multilingual-GGUF')

// Create rerank model with the path
const model = llama.rerankModel(modelPath)

await model.prepare()

// Rerank documents based on relevance to query
const { ranking } = await rerank({
  model,
  query: 'What is artificial intelligence?',
  documents: [
    'AI is a branch of computer science.',
    'The weather is nice today.',
    'Machine learning is a subset of AI.',
    'I like pizza.',
  ],
})

// Results are sorted by relevance (highest first)
ranking.forEach((result, rank) => {
  console.log(`Rank ${rank + 1}:`, {
    relevanceScore: result.relevanceScore,
    index: result.index, // Original index in the documents array
  })
})
```

## Limiting Results

Use `topN` to limit the number of returned documents:

```typescript
const { ranking } = await rerank({
  model,
  query: 'What is artificial intelligence?',
  documents: ['doc1', 'doc2', 'doc3', 'doc4', 'doc5'],
  topN: 3,
})
```

## Model Configuration

Configure the rerank model with specific options:

```typescript
const model = llama.rerankModel(modelPath, {
  normalize: 1, // Score normalization (default: from model config)
  contextParams: {
    n_ctx: 2048, // Context size (default: 2048)
    n_gpu_layers: 99, // GPU layers (default: 99)
  },
})
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `normalize` | number | model default | Score normalization mode |
| `contextParams.n_ctx` | number | 2048 | Context window size |
| `contextParams.n_gpu_layers` | number | 99 | GPU layers for acceleration |

## Result Format

Each result in the ranking array contains:

| Property | Type | Description |
| --- | --- | --- |
| `relevanceScore` | number | Relevance score (higher = more relevant) |
| `index` | number | Index of the document in the original input array |

## Cleanup

Release resources when done:

```typescript
await model.unload() // Release from memory
```
