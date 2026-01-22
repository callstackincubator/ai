# Embeddings

Generate text embeddings for RAG (Retrieval-Augmented Generation), semantic search, and similarity comparisons using the Llama provider.

## Requirements

- An embedding-capable GGUF model (models trained for embeddings)
- Models must be downloaded and prepared before use

## Basic Usage

```typescript
import { llama } from '@react-native-ai/llama'
import { embed } from 'ai'

// Create embedding model
const model = llama.textEmbeddingModel(
  'owner/repo/embedding-model.gguf'
)

await model.download()
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
import { llama } from '@react-native-ai/llama'
import { embedMany } from 'ai'

const model = llama.textEmbeddingModel(
  'owner/repo/embedding-model.gguf'
)
await model.download()
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
const model = llama.textEmbeddingModel(
  'owner/repo/embedding-model.gguf',
  {
    normalize: -1, // Normalization mode (default: -1)
    contextParams: {
      n_ctx: 2048, // Context size (default: 2048)
      n_gpu_layers: 99, // GPU layers (default: 99)
      n_parallel: 8, // Parallel embeddings (default: 8)
    },
  }
)
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `normalize` | number | -1 | Embedding normalization mode |
| `contextParams.n_ctx` | number | 2048 | Context window size |
| `contextParams.n_gpu_layers` | number | 99 | GPU layers for acceleration |
| `contextParams.n_parallel` | number | 8 | Number of parallel embeddings |

## Use Cases

### Semantic Search

```typescript
import { llama } from '@react-native-ai/llama'
import { embed, embedMany } from 'ai'

const model = llama.textEmbeddingModel('owner/repo/embedding-model.gguf')
await model.download()
await model.prepare()

// Index documents
const documents = [
  'React Native enables mobile app development',
  'Machine learning models can run on-device',
  'TypeScript adds static typing to JavaScript',
]

const { embeddings: docEmbeddings } = await embedMany({
  model,
  values: documents,
})

// Query
const { embedding: queryEmbedding } = await embed({
  model,
  value: 'How to build mobile apps?',
})

// Calculate similarity (cosine similarity)
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// Find most similar document
const similarities = docEmbeddings.map((emb, i) => ({
  document: documents[i],
  score: cosineSimilarity(queryEmbedding, emb),
}))

similarities.sort((a, b) => b.score - a.score)
console.log('Most relevant:', similarities[0].document)
```

### RAG (Retrieval-Augmented Generation)

Combine embeddings with language models for RAG:

```typescript
import { llama } from '@react-native-ai/llama'
import { embed, embedMany, generateText } from 'ai'

// Setup models
const embeddingModel = llama.textEmbeddingModel('owner/repo/embedding-model.gguf')
const languageModel = llama.languageModel('owner/repo/chat-model.gguf')

await Promise.all([
  embeddingModel.download(),
  languageModel.download(),
])

await Promise.all([
  embeddingModel.prepare(),
  languageModel.prepare(),
])

// Your knowledge base
const knowledgeBase = [
  'React Native AI supports on-device inference',
  'Models can be downloaded from HuggingFace',
  'The Llama provider uses llama.rn under the hood',
]

// Index knowledge base
const { embeddings: kbEmbeddings } = await embedMany({
  model: embeddingModel,
  values: knowledgeBase,
})

// User query
const query = 'How does React Native AI work?'
const { embedding: queryEmbedding } = await embed({
  model: embeddingModel,
  value: query,
})

// Find relevant context (simplified - use proper vector search in production)
const relevantDocs = findTopK(queryEmbedding, kbEmbeddings, knowledgeBase, 2)

// Generate response with context
const { text } = await generateText({
  model: languageModel,
  prompt: `Context: ${relevantDocs.join('\n')}\n\nQuestion: ${query}\n\nAnswer:`,
})

console.log(text)
```

## Cleanup

Release resources when done:

```typescript
await model.unload() // Release from memory
await model.remove() // Delete from disk (optional)
```
