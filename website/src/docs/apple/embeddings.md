# Apple Embeddings

Generate text embeddings using Apple's on-device NLContextualEmbedding model with the AI SDK.

## Overview

The Apple Embeddings provider uses Apple's [`NLContextualEmbedding`](https://developer.apple.com/documentation/naturallanguage/nlcontextualembedding) to generate contextual text embeddings entirely on-device. This is Apple's implementation of a BERT-like transformer model integrated into iOS 17+, providing privacy-preserving text understanding capabilities.

## Model Architecture

NLContextualEmbedding uses a transformer-based architecture trained with masked language modeling (similar to BERT). Apple provides three optimized models grouped by writing system:

- **Latin Script Model** (20 languages): English, Spanish, French, German, Italian, Portuguese, Dutch, and others - produces 512-dimensional embeddings
- **Cyrillic Script Model** (4 languages): Russian, Ukrainian, Bulgarian, Serbian  
- **CJK Model** (3 languages): Chinese, Japanese, Korean

Each model is multilingual within its script family, enabling cross-lingual semantic understanding. The models are compressed and optimized for Apple's Neural Engine, typically under 100MB when downloaded.

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
// ISO codes
await embed({
  model: apple.textEmbeddingModel(), 
  value: 'Bonjour',
  language: 'fr' 
})
```

For list of all supported languages, [check Apple documentation](https://developer.apple.com/documentation/naturallanguage/nlcontextualembedding#overview).

> [!NOTE]
> The default language is english.

## Asset Management

Apple's NLContextualEmbedding requires downloading language-specific assets to the device. The provider automatically requests assets when needed, but you can also prepare them manually:

```tsx
import { NativeAppleEmbeddings } from '@react-native-ai/apple'

// Pre-download assets for a language
try {
  await NativeAppleEmbeddings.prepare('en')
  console.log('English assets ready')
} catch (error) {
  console.log('Assets not available:', error)
}
```

The asset management system is designed to be efficient and user-friendly. When you call `prepare()` for a language, the system first checks if the required assets are already present on the device. If they are, the method resolves immediately without any network activity, making subsequent embedding operations instant.

> [!NOTE]
> All language models and assets are stored in Apple's system-wide assets catalog, separate from your app bundle. This means zero impact on your app's size. Assets may already be available if the user has previously used other apps, or if system features have requested them.

## Direct API Access

For advanced use cases, you can access the native Apple embeddings API directly:

### NativeAppleEmbeddings

```tsx
import { NativeAppleEmbeddings } from '@react-native-ai/apple'

// Get embedding model information
await NativeAppleEmbeddings.getInfo(language: string): Promise<EmbeddingInfo>

// Prepare language assets
await NativeAppleEmbeddings.prepare(language: string): Promise<void>

// Generate embeddings
const embeddings = await NativeAppleEmbeddings.generateEmbeddings(
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
