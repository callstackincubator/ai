# Streaming

Stream text generation in real-time using the Vercel AI SDK's `streamText` function with Apple Foundation Models.

## Basic Streaming

Generate streaming text responses that arrive incrementally:

```typescript
import { streamText } from 'ai';
import { apple } from '@react-native-ai/apple';

const { textStream } = await streamText({
  model: apple(),
  prompt: 'Write me a short essay on the meaning of life'
});

for await (const delta of textStream) {
  console.log(delta);
}
```

> [!NOTE]
> Streaming objects is currently not supported.
