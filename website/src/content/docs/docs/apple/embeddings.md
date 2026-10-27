---
title: "Embeddings"
---

Generate text embeddings on device with Apple's
[`NLContextualEmbedding`](https://developer.apple.com/documentation/naturallanguage/nlcontextualembedding),
a BERT-style model available on iOS 17 and later. Use them for semantic
search, similarity, and clustering.

## Usage

```tsx
import { apple } from '@react-native-ai/apple'
import { embed, embedMany } from 'ai'

const { embedding } = await embed({
  model: apple.embeddingModel(),
  value: 'Hello world',
})

const { embeddings } = await embedMany({
  model: apple.embeddingModel(),
  values: ['Hello world', 'How are you?', 'Goodbye'],
})
```

## Languages

Apple groups languages into models by writing system, such as Latin or
Cyrillic, and adds more scripts in newer iOS versions. Each model covers
several languages, so texts in different languages of the same script can be
compared. The model uses the device language by default. Pass an
[ISO 639-1 code](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes)
or a locale identifier such as `fr-FR` to pick another:

```tsx
const model = apple.embeddingModel({ language: 'fr' })

await embed({ model, value: 'Bonjour' })
```

See [Apple's documentation](https://developer.apple.com/documentation/naturallanguage/nlcontextualembedding#overview)
for the supported languages and the iOS version that added each.

## Preparing the Model

Each language's assets are downloaded once by the system, into a catalog shared
by all apps, so they add nothing to your app's size and may already be on the
device. Call `prepare()` ahead of time, for example when the screen opens, so
the first request does not wait for the download:

```tsx
const model = apple.embeddingModel({ language: 'en' })
await model.prepare()
```

`prepare()` resolves right away when the assets are already there. Without it,
the first request prepares the model itself and logs a warning.

## Direct API Access

`AppleEmbeddings` is the native module behind the model:

```tsx
import { AppleEmbeddings } from '@react-native-ai/apple'

const language = 'en'

// { hasAvailableAssets, dimension, languages, maximumSequenceLength,
//   modelIdentifier, revision, scripts }
const info = await AppleEmbeddings.getModelInfo(language)

await AppleEmbeddings.prepare(language)

// One number[] per value
const embeddings = await AppleEmbeddings.generateEmbeddings(
  ['Hello world', 'How are you?'],
  language
)
```

## Benchmarks

Average time per embedding over 5 runs on an iPhone 16 Pro:

| Text length        | Time     |
| ------------------ | -------- |
| Short, ~10 tokens  | 19.19 ms |
| Medium, ~30 tokens | 21.53 ms |
| Long, ~90 tokens   | 33.59 ms |
