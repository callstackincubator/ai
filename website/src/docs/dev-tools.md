![AI SDK Profiler preview](/dev-tools-preview.png)

# AI SDK Profiler DevTools

A Rozenite plugin that captures Vercel AI SDK spans and surfaces them in
Rozenite DevTools. Inspect requests, inputs, outputs, provider metadata, and
latency.

DevTools are runtime agnostic, so they work with on-device and remote runtimes.

## Installation

```bash
npm install @react-native-ai/dev-tools-plugin
```

## Rozenite setup

This plugin requires Rozenite to be installed and enabled in your app.
Follow the Rozenite getting started guide to install and configure it:
https://www.rozenite.dev/docs/getting-started

## Quick Start

### 1. Initialize the tracer and DevTools hook

```tsx
import {
  getAiSdkTracer,
  useAiSdkDevTools,
} from '@react-native-ai/dev-tools-plugin';

export function App() {
  useAiSdkDevTools();
  return <RootNavigator />;
}
```

### 2. Enable AI SDK telemetry on requests

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getAiSdkTracer } from '@react-native-ai/dev-tools-plugin';

const tracer = getAiSdkTracer({
  serviceName: 'my-app',
});

await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'Write a short story about a cat.',
  experimental_telemetry: {
    isEnabled: true,
    tracer,
    functionId: 'unique-identifier-where-the-call-comes-from',
  },
});
```

### 3. Open DevTools

Start your development server and open Rozenite DevTools. Select
**AI SDK Profiler** to inspect the spans.
