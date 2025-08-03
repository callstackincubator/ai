# Apple Embeddings

Generate text embeddings using Apple's on-device NLContextualEmbedding model with the AI SDK.

## Overview

This provider uses Apple's [`NLContextualEmbedding`](https://developer.apple.com/documentation/naturallanguage/nlcontextualembedding) to generate contextual text embeddings entirely on-device. This is Apple's implementation of a BERT-like transformer model integrated into iOS 17+, providing privacy-preserving text understanding capabilities.

## Model Architecture

NLContextualEmbedding uses a transformer-based architecture trained with masked language modeling (similar to BERT). Apple provides three optimized models grouped by writing system:

- **Latin Script Model** (20 languages): English, Spanish, French, German, Italian, Portuguese, Dutch, and others - produces 512-dimensional embeddings
- **Cyrillic Script Model** (4 languages): Russian, Ukrainian, Bulgarian, Serbian  
- **CJK Model** (3 languages): Chinese, Japanese, Korean

Each model is multilingual within its script family, enabling cross-lingual semantic understanding. The models are compressed and optimized for Apple's Neural Engine, typically under 100MB when downloaded.

## Requirements

- **iOS 17+** - NLContextualEmbedding requires iOS 17 or later

## Usage

### Single Text

```tsx
import { embed } from 'ai'
import { apple } from '@react-native-ai/apple'

const { embedding } = await embed({
  model: apple.textEmbeddingModel(),
  value: 'Hello world',
})

console.log(embedding)
```

### Multiple Texts

```tsx
import { embedMany } from 'ai'
import { apple } from '@react-native-ai/apple'

const { embeddings } = await embedMany({
  model: apple.textEmbeddingModel(),
  values: ['Hello world', 'How are you?', 'Goodbye'],
})

console.log(embeddings)
```

## Language Support

The embeddings model supports multiple languages. You can specify the language using [ISO 639-1 codes](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes) or full names:

```tsx
await embed({
  model: apple.textEmbeddingModel(), 
  value: 'Bonjour',
  providerOptions: {
    apple: {
      language: 'fr',
    }
  }
})
```

For list of all supported languages, [check Apple documentation](https://developer.apple.com/documentation/naturallanguage/nlcontextualembedding#overview).

> [!NOTE]
> By default, the embeddings model will use device language.

## Asset Management

Apple's NLContextualEmbedding requires downloading language-specific assets to the device. The provider automatically requests assets when needed, but you can also prepare them manually:

```tsx
import { NativeAppleEmbeddings } from '@react-native-ai/apple'

await NativeAppleEmbeddings.prepare('en')
```

When you call `prepare()` for a language, the system first checks if the required assets are already present on the device. If they are, the method resolves immediately without any network activity, making subsequent embedding operations instant.

> [!NOTE]
> All language models and assets are stored in Apple's system-wide assets catalog, separate from your app bundle. This means zero impact on your app's size. Assets may already be available if the user has previously used other apps, or if system features have requested them.

## Direct API Access

For advanced use cases, you can access the embeddings API directly:

### AppleEmbeddings

```tsx
import { AppleEmbeddings } from '@react-native-ai/apple'

// Get embedding model information
const modelInfo: EmbeddingInfo = await AppleEmbeddings.getInfo(language: string)

// Prepare language assets
await AppleEmbeddings.prepare(language: string)

// Generate embeddings
const embeddings = await AppleEmbeddings.generateEmbeddings(
  values: string[], 
  language: string
): Promise<number[][]>

export interface EmbeddingInfo {
  hasAvailableAssets: boolean
  dimension: number
  languages: string[]
  maximumSequenceLength: number
  modelIdentifier: string
  revision: number
  scripts: string[]
}
```

## Benchmarks

Performance results showing processing time in milliseconds per embedding across different text lengths:

| Device         | Short (~10 tokens) | Medium (~30 tokens) | Long (~90 tokens) |
|----------------|--------------------|----------------------|-------------------|
| iPhone 16 Pro  | 19.19              | 21.53                | 33.59             |

Each category is tested with 5 consecutive runs to calculate reliable averages and account for system variability.
