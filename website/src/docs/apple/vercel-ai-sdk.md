# Vercel AI SDK

The Vercel AI SDK provides a unified API for working with various language models. You can use it with Apple LLM to generate text and stream responses.

## Text Generation

```typescript
import { generateText } from 'ai';
import { apple } from '@react-native-ai/apple';

const { text } = await generateText({
  model: apple(),
  prompt: 'Explain quantum computing in simple terms',
});
```

## Streaming

```typescript
import { streamText } from 'ai';
import { apple } from '@react-native-ai/apple';

const { textStream } = await streamText({
  model: apple(),
  system: 'You are a helpful assistant',
  prompt: 'Write a short story about AI',
});

for await (const delta of textStream) {
  process.stdout.write(delta);
}
```
