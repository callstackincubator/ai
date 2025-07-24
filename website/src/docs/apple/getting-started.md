# Getting Started

The Apple provider enables you to use Apple Foundation Models with the Vercel AI SDK in React Native applications.

## Installation

Install the Apple provider and required dependencies

```bash
npm install @react-native-ai/apple ai@beta
```

## Requirements

- **iOS 26+** - Apple Foundation Models require iOS 26 or later
- **Apple Intelligence enabled device** - Device must support Apple Intelligence
- **React Native New Architecture** - Required for native module functionality
- **Vercel AI SDK v5** - This provider requires AI SDK v5 or later

> [!NOTE]
> You must install required polyfills as explained in the [Vercel AI documentation](https://v5.ai-sdk.dev/docs/getting-started/expo#polyfills).

## Basic Usage

Import the Apple provider and use it with the AI SDK:

```typescript
import { apple } from '@react-native-ai/apple';
import { generateText } from 'ai';

const result = await generateText({
  model: apple(),
  prompt: 'Explain quantum computing in simple terms'
});
```
