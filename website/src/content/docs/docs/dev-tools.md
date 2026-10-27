---
title: "AI SDK Profiler DevTools"
---

See every AI SDK call your app makes, with its inputs, outputs, provider
metadata and timing, in Rozenite DevTools.

![AI SDK Profiler preview](/dev-tools-preview.png)

It works the same for on-device and remote models.

## Installation

```bash
npm install @react-native-ai/dev-tools @ai-sdk/otel
```

## Rozenite setup

The plugin runs inside Rozenite, so install and enable it first with the
[Rozenite getting started guide](https://www.rozenite.dev/docs/getting-started).

## Quick Start

### 1. Initialize the tracer and DevTools hook

```tsx
import {
  getAiSdkTracer,
  useAiSdkDevTools,
} from '@react-native-ai/dev-tools';

export function App() {
  useAiSdkDevTools();
  return <RootNavigator />;
}
```

### 2. Enable AI SDK telemetry on requests

```ts
import { OpenTelemetry } from '@ai-sdk/otel';
import { generateText, registerTelemetry } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getAiSdkTracer } from '@react-native-ai/dev-tools';

// Register once, at app startup
registerTelemetry(
  new OpenTelemetry({
    tracer: getAiSdkTracer({ serviceName: 'my-app' }),
  })
);

await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'Write a short story about a cat.',
  telemetry: {
    functionId: 'unique-identifier-where-the-call-comes-from',
  },
});
```

### 3. Open DevTools

Start your development server and open Rozenite DevTools. Select
**AI SDK Profiler** to inspect the spans.
