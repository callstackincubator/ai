# Generating

You can generate responses using MLC models with the Vercel AI SDK's `generateText`, `streamText`, or `generateObject` functions.

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

## Structured Output

Generate structured data that conforms to a specific schema:

```typescript
import { generateObject } from 'ai';
import { mlc } from '@react-native-ai/mlc';
import { z } from 'zod';

// Create and prepare model
const model = mlc.languageModel('Llama-3.2-3B-Instruct');
await model.prepare();

const schema = z.object({
  name: z.string(),
  description: z.string()
});

const result = await generateObject({
  model,
  prompt: 'Who are you? Please identify yourself and your capabilities.',
  schema
});

console.log(result.object);
```
## Available Options

Configure model behavior with generation options:

- `temperature` (0-1): Controls randomness. Higher values = more creative, lower = more focused
- `maxTokens`: Maximum number of tokens to generate
- `topP` (0-1): Nucleus sampling threshold
- `topK`: Top-K sampling parameter

You can pass selected options with `generateText`, `streamText`, or `generateObject` as follows:

```typescript
import { mlc } from '@react-native-ai/mlc';
import { generateText } from 'ai';

// Create and prepare model
const model = mlc.languageModel('Llama-3.2-3B-Instruct');
await model.prepare();

const result = await generateText({
  model,
  prompt: 'Write a creative story',
  temperature: 0.8,
  maxTokens: 500,
  topP: 0.9,
});
```
