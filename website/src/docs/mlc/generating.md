# Generating

You can generate responses using MLC models with the Vercel AI SDK's `generateText` or `streamText` functions.

## Requirements

- Models must be downloaded and prepared before use
- Sufficient device storage for model files (1-4GB per model)

## Text Generation

```typescript
import { MLCEngine, mlc } from '@react-native-ai/mlc';
import { generateText } from 'ai';

// Ensure model is ready
await MLCEngine.prepareModel('Llama-3.2-3B-Instruct');

const result = await generateText({
  model: mlc('Llama-3.2-3B-Instruct'),
  prompt: 'Explain quantum computing in simple terms'
});

console.log(result.text);
```

## Streaming

Stream responses for real-time output:

```typescript
import { getModel, prepareModel } from '@react-native-ai/mlc';
import { streamText } from 'ai';

await MLCEngine.prepareModel('Llama-3.2-3B-Instruct');

const { textStream } = await streamText({
  model: mlc('Llama-3.2-3B-Instruct'),
  prompt: 'Write a short story about a robot learning to paint'
});

for await (const delta of textStream) {
  console.log(delta);
}
```
