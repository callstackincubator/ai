# Reranking

Rank documents by how relevant they are to a query, for example to reorder
search results before passing the best ones to a language model. Use a GGUF
model trained for reranking:

```typescript
import { downloadModel, llama } from '@react-native-ai/llama'
import { rerank } from 'ai'

const modelPath = await downloadModel(
  'gpustack/bge-reranker-v2-m3-GGUF/bge-reranker-v2-m3-Q4_K_M.gguf'
)
const model = llama.rerankingModel(modelPath)
await model.prepare()

const { ranking } = await rerank({
  model,
  query: 'What is artificial intelligence?',
  documents: [
    'AI is a branch of computer science.',
    'The weather is nice today.',
    'Machine learning is a subset of AI.',
    'I like pizza.',
  ],
  topN: 2,
})

// Sorted by relevance, highest first
for (const { index, relevanceScore } of ranking) {
  console.log(index, relevanceScore)
}
```

Each result has the `index` of the document in `documents` and its
`relevanceScore`, where higher is more relevant. `topN` limits how many results
are returned.

## Options

```typescript
const model = llama.rerankingModel(modelPath, {
  normalize: 1,
  contextParams: { n_ctx: 2048 },
})
```

See the [API reference](./model-management#llamarerankingmodelmodelpath-options)
for every option. Call `model.unload()` to free the memory when you are done.
