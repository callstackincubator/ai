---
title: "Embeddings"
---

Search text and photos by meaning. A CLIP model puts text and images in the
same space, so a query such as "a dog on a beach" finds the matching photos.
Use the [hosted CLIP ViT-B/32 model](/docs/core-ai/models#hosted-exports) with
the AI SDK's `embed` and `embedMany`:

```typescript
import { coreAI } from '@react-native-ai/core-ai'
import { cosineSimilarity, embed, embedMany } from 'ai'

const model = coreAI.embeddingModel({
  id: 'clip-vit-base-patch32',
  source: clipDirectory,
})

const { embedding } = await embed({ model, value: 'a photo of a cat' })

const { embeddings } = await embedMany({
  model,
  values: ['a photo of a cat', 'a red sports car', 'a bowl of soup'],
})
```

The hosted model returns 512-dimensional, normalized embeddings.

## Images

The AI SDK has no call for image embeddings, so the model has its own. It
takes file URIs:

```typescript
const {
  embeddings: [photo],
} = await model.embedImages([photoUri])

const scores = embeddings.map((text) => cosineSimilarity(text, photo))
```

## Options

- `providerOptions['core-ai'].batchSize` sets how many texts are embedded at
  once (16 by default), for models with a dynamic batch size.
- `mean` and `std` override the CLIP normalization of images.

## Your Own Exports

An export needs an `encode_text` and an `encode_image` function, plus the CLIP
tokenizer in `tokenizer/tokenizer.json`. Apple's CLIP recipe exports a single
function, so the hosted model's card links a script that splits it. Use
`textFunction` and `imageFunction` to name other functions; a model with a
single `main` function works too.
