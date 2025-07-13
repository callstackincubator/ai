# Apple LLM

Use Apple's local LLM functionality (Apple Intelligence) in React Native. Standalone, or with Vercel AI SDK.

## Features

### Supported
- Text generation
- Streaming
- Structured output (JSON Schema via Zod)

### Coming Soon
- Tool calling

## Installation

```bash
npm install @react-native-ai/apple
```

### Requirements

- React Native New Architecture
- iOS 26+
- Apple Intelligence enabled device

## Usage

### Standalone

```typescript
import { foundationModels } from '@react-native-ai/apple';

// Check if Apple Intelligence is available
const isAvailable = await foundationModels.isAvailable()

if (isAvailable) {
  // Generate text
  const response = await foundationModels.generateText([
    { role: 'user', content: 'Explain quantum computing in simple terms' }
  ]);
  console.log(response);
}
```

### AI SDK

```typescript
import { generateText } from 'ai';
import { apple } from '@react-native-ai/apple';

const { text } = await generateText({
  model: apple(),
  prompt: 'Explain quantum computing in simple terms',
});
```

## Streaming

> [!NOTE]
> If you're using streaming functionality, you'll need to provide a polyfill for ReadableStream. You can use `web-streams-polyfill`:
> 
> ```bash
> npm install web-streams-polyfill
> ```
> 
> We also recommend installing AsyncIterator polyfill to enable the simple `for await...of` syntax:
> 
> ```bash
> npm install @azure/core-asynciterator-polyfill
> ```
> 
> ```typescript
> import '@azure/core-asynciterator-polyfill';
> import 'web-streams-polyfill/polyfill';
> ```

### Standalone

```typescript
import { foundationModels } from '@react-native-ai/apple';

const stream = foundationModels.generateStream([
  { role: 'user', content: 'Write a short story about AI' }
]);

for await (const chunk of stream) {
  if (chunk.type === 'text-delta') {
    process.stdout.write(chunk.textDelta);
  }
}
```

### AI SDK

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

## Options

Both `generateText` and `generateStream` accept an optional second parameter with generation options:

### Available Options

- `temperature` (number): Controls randomness of output. Higher values = more creative, lower values = more focused. Maximum value is `2.0`
- `maxTokens` (number): Maximum number of tokens in the response
- `topK` (number): Limits sampling to top K most likely tokens
- `topP` (number): Nucleus sampling threshold (cannot be used with topK). Maximum value is `1.0`.
- `schema` (ZodObject): Zod schema for structured output

> [!NOTE]
> You cannot specify both `topK` and `topP` simultaneously

### Example

```typescript
const result = await foundationModels.generateText(messages, {
  temperature: 0.7,
  maxTokens: 500,
  topP: 0.9,
});
```

## Structured Output

Apple LLM supports structured outputs using JSON Schema via Zod.

### Usage

> [!INFO]
> For more examples, check [example code](../../apps/example-apple/src/schema-demos.ts)

```typescript
import { foundationModels } from '@react-native-ai/apple';
import { z } from 'zod';

const schema = z.object({
  name: z.string(),
  age: z.number().int().min(0).max(150),
  email: z.string().email(),
});

const result = await foundationModels.generateText([
  { role: 'user', content: 'Create a user profile' }
], { schema });

// Result is properly typed:
// { name: string, age: number, email: string }
```

### Supported Types

- Objects, arrays, strings, numbers, booleans, enums
- Number constraints: `min`, `max`, `exclusiveMin`, `exclusiveMax`

### Unsupported Types

- String formats: `date-time`, `time`, `date`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid`
- AnyOf

## License

MIT

---

Made with ❤️ and [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
