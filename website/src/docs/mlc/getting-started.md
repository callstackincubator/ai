# Getting Started

The MLC provider enables you to run large language models directly on-device in React Native applications. This includes popular models like Llama, Phi-3, Mistral, and Qwen that run entirely on-device for privacy, performance, and offline capabilities.

## Installation

Install the MLC provider:

```bash
npm install @react-native-ai/mlc
cd ios && pod install
```

While you can use the MLC provider standalone, we recommend using it with the Vercel AI SDK for a much better developer experience. The AI SDK provides unified APIs, streaming support, and advanced features. To use with the AI SDK, you'll need v5 and [required polyfills](https://v5.ai-sdk.dev/docs/getting-started/expo#polyfills):

```bash
npm install ai@beta
```

## Requirements

- **React Native New Architecture** - Required for native module functionality
- **Increased Memory Limit capability** - Required for large model loading

## Configuration

### Expo Config Plugin

For Expo projects, add the MLC config plugin to automatically configure the increased memory limit capability:

```json
{
  "expo": {
    "plugins": [
      "@react-native-ai/mlc"
    ]
  }
}
```

The plugin automatically adds the `com.apple.developer.kernel.increased-memory-limit` entitlement to your iOS app, which enables better performance for memory-intensive ML operations.

After adding the plugin, run:

```bash
npx expo prebuild --clean
```

### Manual Installation

If you're not using Expo or prefer manual configuration, add the "Increased Memory Limit" capability in Xcode:

1. Open your iOS project in Xcode
2. Navigate to your target's **Signing & Capabilities** tab  
3. Click **+ Capability** and add "Increased Memory Limit"

## Basic Usage

Import the MLC provider and use it with the AI SDK:

```typescript
import { mlc } from '@react-native-ai/mlc';
import { generateText } from 'ai';

const model = mlc.languageModel("Llama-3.2-3B-Instruct");

await model.download();
await model.prepare();

const result = await generateText({
  model,
  prompt: 'Explain quantum computing in simple terms'
});
```

## Next Steps

- **[Model Management](./model-management.md)** - Complete guide to model lifecycle, available models, and API reference
- **[Generating](./generating.md)** - Learn how to generate text and stream responses
