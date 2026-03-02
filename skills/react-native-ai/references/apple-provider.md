# Apple Provider

## Quick Command

```bash
npm add @react-native-ai/apple
```

```ts
import {apple} from '@react-native-ai/apple';
import {generateText} from 'ai';

const result = await generateText({
  model: apple(),
  prompt: 'Explain quantum computing in simple terms',
});
```

## When to Use

- Use Apple Intelligence on iOS 26+
- Need language model, embeddings, transcription, or speech

## Prerequisites

- [ ] React Native New Architecture
- [ ] iOS 26+ (Android not supported)
- [ ] Apple Intelligence enabled device
- [ ] Vercel AI SDK v5+ (`ai`)
- [ ] Android or iOS

## Step-by-Step Instructions

### 1. Install

```bash
npm add @react-native-ai/apple
```

### 2. Availability Check

```ts
import {apple} from '@react-native-ai/apple';

if (apple.isAvailable()) {
  // Use Apple provider
}
```

### 3. Model Types

| Type          | Method                       | Use Case              |
| ------------- | ---------------------------- | --------------------- |
| Language      | `apple.languageModel()`      | Text generation, chat |
| Embedding     | `apple.textEmbeddingModel()` | RAG, similarity       |
| Transcription | `apple.transcriptionModel()` | Speech-to-text        |
| Speech        | `apple.speechModel()`        | Text-to-speech        |

### 4. Tool Calling

```ts
import {createAppleProvider} from '@react-native-ai/apple';

const apple = createAppleProvider({availableTools: tools});
const model = apple.languageModel();
```

## Common Pitfalls

- **Wrong iOS version**: Apple Intelligence requires iOS 26+.
- **Simulator**: For now only physical devices are supported.
- **New Architecture**: React Native New Architecture is required.

## Related Skills

- [quick-start](quick-start.md)
- [llama-provider](llama-provider.md)
- [mlc-provider](mlc-provider.md)
