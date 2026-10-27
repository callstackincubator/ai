# Embeddings

`coreAI.embeddingModel(config)` runs CLIP-style exports with `embed` and `embedMany`, and embeds images into the same space, for search across text and photos.

```typescript
import { coreAI } from '@react-native-ai/core-ai'
import { cosineSimilarity, embed, embedMany } from 'ai'

const model = coreAI.embeddingModel({
  id: 'clip-vit-base-patch32',
  source: { type: 'file', uri: clipDirectory },
})

const { embedding } = await embed({ model, value: 'a photo of a cat' })

const { embeddings } = await embedMany({
  model,
  values: ['a photo of a cat', 'a red sports car', 'a bowl of soup'],
})
```

## Images

The AI SDK has no image embedding call, so the model has its own:

```typescript
const {
  embeddings: [photo],
} = await model.embedImages([photoUri])

const scores = embeddings.map((text) => cosineSimilarity(text, photo))
```

`embedImages` takes file URIs, and embeds them in batches.

## Model Format

The model folder holds an `.aimodel` with two functions, and the CLIP tokenizer:

- `encode_text(input_ids, attention_mask)`: `[batch, 77]` int32 token ids, returning `[batch, dimensions]`
- `encode_image(pixel_values)`: `[batch, 3, 224, 224]` RGB, returning `[batch, dimensions]`
- `tokenizer/tokenizer.json`

The [hosted CLIP ViT-B/32 export](./models#hosted-exports) returns 512-dimensional L2-normalized embeddings. Its card links the export script, which splits Apple's CLIP recipe into the two functions.

- Text is tokenized to the function's context length (77 for CLIP), and embedded 16 values at a time. `providerOptions['core-ai'].batchSize` changes that, for functions with a dynamic batch dimension. Functions exported with a fixed batch size embed that many at a time, padding the last batch.
- Images are resized on the shorter side, cropped to the center, and normalized with the CLIP mean and std. `mean` and `std` options override them.
- `textFunction` and `imageFunction` options name other functions, and models with a single `main` function work too.
- Embeddings need no `coreai-models` product of their own: the CLIP tokenizer ships with every product.
