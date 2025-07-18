# Streaming

You can stream text using the `generateStream` method from `foundationModels`.

## Polyfills

If you're using streaming functionality, you'll need to provide a polyfill for `ReadableStream`. You can use `web-streams-polyfill`:

```bash
npm install web-streams-polyfill
```

We also recommend installing an `AsyncIterator` polyfill to enable the simple `for await...of` syntax:

```bash
npm install @azure/core-asynciterator-polyfill
```

Make sure to include the following imports before streaming:

```typescript
import '@azure/core-asynciterator-polyfill';
import 'web-streams-polyfill/polyfill';
```

## Usage

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

The `generateStream` method can also accept an optional second parameter for generation [options](./options.md).

> [!TIP]
> Before calling `generateStream`, it's recommended to check if Apple Intelligence is available on the device using the `isAvailable` function.

