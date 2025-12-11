# Getting Started

The Apple provider enables you to use Apple's on-device AI capabilities with the Vercel AI SDK in React Native applications. This includes language models, text embeddings, and other Apple-provided AI features that run entirely on-device for privacy and performance.

## Installation

Install the Apple provider:

```bash
npm install @react-native-ai/apple
```

While you can use the Apple provider standalone, we recommend using it with the Vercel AI SDK for a much better developer experience. The AI SDK provides unified APIs, streaming support, and advanced features. To use with the AI SDK, you'll need v5 and [required polyfills](https://v5.ai-sdk.dev/docs/getting-started/expo#polyfills):

```bash
npm install ai
```

## Requirements

- **React Native New Architecture** - Required for native module functionality

> [!NOTE]
> Different Apple AI features have varying iOS version requirements. Check the specific API documentation for compatibility details.

## Running on Simulator

To use Apple Intelligence with the iOS Simulator, you need to enable it on your macOS system first. See the [Running on Simulator](./running-on-simulator) guide for detailed setup instructions.

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
