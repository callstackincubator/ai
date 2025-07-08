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

### Pure Usage

```typescript
import { foundationModels } from '@react-native-ai/apple';

// Check if Apple Intelligence is available
const isAvailable = await foundationModels.isAvailable();

if (isAvailable) {
  // Generate text
  const response = await foundationModels.generateText([
    { role: 'user', content: 'Explain quantum computing in simple terms' }
  ]);
  console.log(response);
}
```

### With AI SDK

```typescript
import { generateText } from 'ai';
import { apple } from '@react-native-ai/apple';

const { text } = await generateText({
  model: apple(),
  prompt: 'Explain quantum computing in simple terms',
});
```

## Streaming

> [!WARNING]
> If you're using streaming functionality, you'll need to provide a polyfill for ReadableStream. You can use `web-streams-polyfill`:
> 
> ```bash
> npm install web-streams-polyfill
> ```
> 
> ```typescript
> import 'web-streams-polyfill/polyfill';
> ```

### Pure Usage

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

### AI SD

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
