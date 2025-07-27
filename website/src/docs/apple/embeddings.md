# Apple Embeddings

Generate text embeddings using Apple's on-device NLContextualEmbedding model with the AI SDK.

## Overview

The Apple Embeddings provider uses Apple's [`NLContextualEmbedding`](https://developer.apple.com/documentation/naturallanguage/nlcontextualembedding) to generate text embeddings entirely on-device and requires iOS 17 or newer.

Update section with density/architecture.

## Generate Embeddings

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

All language models and assets are stored in Apple's system-wide assets catalog. They may already be available if the user has previously used other apps that leverage Apple Intelligence features, or if system features have requested them. This shared architecture means better performance and storage efficiency across all apps on the device.

## Direct API Access

For advanced use cases, you can access the native Apple embeddings API directly:

### NativeAppleEmbeddings

```tsx
import { NativeAppleEmbeddings } from '@react-native-ai/apple'

// Prepare language assets
await NativeAppleEmbeddings.prepare(language: string): Promise<void>

// Generate embeddings
const embeddings = await NativeAppleEmbeddings.generateEmbeddings(
  values: string[], 
  language: string
): Promise<number[][]>
```
