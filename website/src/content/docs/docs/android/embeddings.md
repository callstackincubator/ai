---
title: "Embeddings"
---

Embed text on device with ML Kit's
[embedding model](https://developers.google.com/ml-kit/genai). It's an alpha
API, and not every device has a model.

```typescript
import { android } from '@react-native-ai/android'
import { cosineSimilarity, embedMany } from 'ai'

const model = android.embeddingModel({ taskType: 'semanticSimilarity' })

const { embeddings } = await embedMany({
  model,
  values: ['The cat sleeps on the sofa.', 'A kitten naps on the couch.'],
})

console.log(cosineSimilarity(embeddings[0], embeddings[1]))
```

`taskType` tells the model what the embeddings are for: `retrievalQuery`,
`retrievalDocument`, `semanticSimilarity`, `classification`, `clustering`,
`questionAnswering`, `factVerification` or `codeRetrieval`.

## Availability and Download

```typescript
const info = await model.getModelInfo()
// { availability: 'available', dimension: 768, modelSignature: '...' }

await model.prepare({ onProgress: (progress) => console.log(progress) })
```

`availability` is `unavailable` when the device has no embedding model.
Embedding prepares the model on its own when you don't.
