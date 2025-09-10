# Generating

You can generate responses using MLC models with the Vercel AI SDK's `generateText` or `streamText` functions.

## Requirements

- Models must be downloaded and prepared before use
- Sufficient device storage for model files (1-4GB per model)

## Text Generation

```typescript
import { mlc } from '@react-native-ai/mlc';
import { generateText } from 'ai';

// Create and prepare model
const model = mlc.languageModel('Llama-3.2-3B-Instruct');
await model.prepare();

const result = await generateText({
  model,
  prompt: 'Explain quantum computing in simple terms'
});

console.log(result.text);
```

## Streaming

Stream responses for real-time output:

```typescript
import { mlc } from '@react-native-ai/mlc';
import { streamText } from 'ai';

// Create and prepare model
const model = mlc.languageModel('Llama-3.2-3B-Instruct');
await model.prepare();

const { textStream } = await streamText({
  model,
  prompt: 'Write a short story about a robot learning to paint'
});

for await (const delta of textStream) {
  console.log(delta);
}
```

