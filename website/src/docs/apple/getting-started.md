# Getting Started

Use Apple's local LLM functionality (Apple Intelligence) in React Native. Standalone, or with Vercel AI SDK.

## Installation

```bash
npm install @react-native-ai/apple
```

### Requirements

- React Native New Architecture
- iOS 26+
- Apple Intelligence enabled device

## Usage

```typescript
import { foundationModels } from '@react-native-ai/apple';

const response = await foundationModels.generateText([
  { role: 'user', content: 'Explain quantum computing in simple terms' }
]);
```

## Next Steps

Continue reading to learn more about generating text, streaming responses, and integrating with the Vercel AI SDK.
