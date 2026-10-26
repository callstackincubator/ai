# Apple Provider

## Quick Command

```bash
npm add @react-native-ai/apple
```

```ts
import { apple } from '@react-native-ai/apple'
import { generateText } from 'ai'

const result = await generateText({
  model: apple(),
  prompt: 'Explain quantum computing in simple terms',
})
```

## When to Use

- Use Apple Intelligence on iOS 26+
- Need language model, embeddings, transcription, or speech

## Prerequisites

- [ ] React Native New Architecture
- [ ] iOS 26+ (Android not supported)
- [ ] Apple Intelligence enabled device
- [ ] Vercel AI SDK v7+ (`ai`)
- [ ] Android or iOS

## Step-by-Step Instructions

### 1. Install

```bash
npm add @react-native-ai/apple
```

### 2. Availability Check

```ts
import { apple } from '@react-native-ai/apple'

if (apple.isAvailable()) {
  // Use Apple provider
}
```

When it is unavailable, `(await apple.getModelInfo()).availability` gives the
reason: `'deviceNotEligible' | 'appleIntelligenceNotEnabled' | 'modelNotReady'
| 'systemNotReady' | 'unknown'`. `'appleIntelligenceNotEnabled'` is fixable by
the user in Settings.

### 3. Model Types

| Type          | Method                       | Use Case                                | Documentation                                            |
| ------------- | ---------------------------- | --------------------------------------- | -------------------------------------------------------- |
| Language      | `apple.languageModel()`      | Text generation, chat                   | https://www.react-native-ai.dev/docs/apple/generating    |
| Embedding     | `apple.embeddingModel()`     | RAG, similarity, prompt size estimation | https://www.react-native-ai.dev/docs/apple/embeddings    |
| Transcription | `apple.transcriptionModel()` | Speech-to-text                          | https://www.react-native-ai.dev/docs/apple/transcription |
| Speech        | `apple.speechModel()`        | Text-to-speech                          | https://www.react-native-ai.dev/docs/apple/speech        |

### 4. Tool Calling

```ts
import { createAppleProvider } from '@react-native-ai/apple'

const apple = createAppleProvider({ availableTools: tools })
const model = apple.languageModel()
```

Use Private Cloud Compute on iOS 27+ when the app has Apple's managed PCC entitlement, and set a reasoning level with the AI SDK `reasoning` option:

```ts
const result = await generateText({
  model: apple('private-cloud-compute'),
  prompt,
  reasoning: 'medium',
})
```

## Common Pitfalls

- **Wrong iOS version**: Apple Intelligence requires iOS 26+.
- **Simulator**: For now only physical devices are supported.
- **New Architecture**: React Native New Architecture is required.

## Related Skills

- [quick-start](quick-start.md)
- [llama-provider](llama-provider.md)
