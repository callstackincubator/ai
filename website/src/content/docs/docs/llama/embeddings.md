---
title: "Embeddings"
---

Generate text embeddings on device for retrieval-augmented generation (RAG),
semantic search, and similarity. Use a GGUF model trained for embeddings, such
as nomic-embed-text:

```typescript
import { downloadModel, llama } from '@react-native-ai/llama'
import { embed, embedMany } from 'ai'

const modelPath = await downloadModel(
  'nomic-ai/nomic-embed-text-v1.5-GGUF/nomic-embed-text-v1.5.Q8_0.gguf'
)
const model = llama.embeddingModel(modelPath)
await model.prepare()

const { embedding } = await embed({
  model,
  value: 'search_query: What is machine learning?',
})

const { embeddings } = await embedMany({
  model,
  values: [
    'search_document: Machine learning is a type of AI',
    'search_document: Deep learning uses neural networks',
  ],
})
```

Some models expect a task prefix. nomic-embed-text uses `search_query: ` for
queries and `search_document: ` for the texts you search, so check the model
card.

## Options

```typescript
const model = llama.embeddingModel(modelPath, {
  normalize: 2, // euclidean, so vectors have length 1
  contextParams: {
    n_ctx: 2048, // longest text, in tokens
    n_parallel: 8, // values embedded per call
  },
})
```

Embeddings are not normalized by default. See the
[API reference](/docs/llama/model-management#llamaembeddingmodelmodelpath-options) for
every option.

Call `model.unload()` to free the memory when you are done.
