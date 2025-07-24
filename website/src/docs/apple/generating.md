# Generating

You can generate response using Apple Foundation Models with the Vercel AI SDK's `generateText` or `generateObject` function.

## Text Generation

```typescript
import { apple } from '@react-native-ai/apple';
import { generateText } from 'ai';

const result = await generateText({
  model: apple(),
  prompt: 'Explain quantum computing in simple terms'
});
```

## Structured Output

Generate structured data that conforms to a specific schema:

```typescript
import { generateObject } from 'ai';
import { apple } from '@react-native-ai/apple';
import { z } from 'zod';

const schema = z.object({
  name: z.string(),
  age: z.number().int().min(0).max(150),
  email: z.string().email(),
  occupation: z.string()
});

const result = await generateObject({
  model: apple(),
  prompt: 'Generate a user profile for a software developer',
  schema
});

console.log(result.object);
// Result is properly typed: { name: string, age: number, email: string, occupation: string }
```

### Supported features

[tbd - what is supported, what is not?]

## Availability Check

Always check if Apple Intelligence is available before using the provider:

```typescript
import { apple } from '@react-native-ai/apple';

if (!apple.isAvailable()) {
  // Handle fallback logic
  return;
}
```

## Available Options

Configure model behavior with generation options:

- `temperature` (0-1): Controls randomness. Higher values = more creative, lower = more focused
- `maxTokens`: Maximum number of tokens to generate
- `topP` (0-1): Nucleus sampling threshold
- `topK`: Top-K sampling parameter

You can pass selected options with either `generateText` or `generateObject` as follows:

```typescript
import { apple } from '@react-native-ai/apple';
import { generateText } from 'ai';

const result = await generateText({
  model: apple(),
  prompt: 'Write a creative story',
  temperature: 0.8,
  maxTokens: 500,
  topP: 0.9,
});
```
