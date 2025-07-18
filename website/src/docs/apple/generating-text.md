# Generating Text

You can generate text using the `generateText` method from `foundationModels`.

Before calling `generateText`, it's recommended to check if Apple Intelligence is available on the device using the `isAvailable` function.

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

The `generateText` method can also accept an optional second parameter for generation [options](./options.md).
