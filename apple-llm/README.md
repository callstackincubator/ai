# Apple LLM

Use Apple's local LLM functionality (Apple Intelligence) with the Vercel AI SDK.

## Installation

```bash
npm install @react-native-ai/apple
```

### Requirements

- New Architecture
- iOS 26+
- Apple Intelligence enabled device

## Usage

```typescript
import { generateText, streamText } from 'ai';
import { apple } from '@react-native-ai/apple';

const { text } = await generateText({
  model: apple(),
  prompt: 'Explain quantum computing in simple terms',
});

const { textStream } = await streamText({
  model: apple(),
  system: 'You are a helpful assistant',
  prompt: 'Write a short story about AI',
});

for await (const delta of textStream) {
  process.stdout.write(delta);
}
```
