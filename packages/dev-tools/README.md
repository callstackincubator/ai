![rozenite-banner](https://www.rozenite.dev/rozenite-banner.jpg)

# @react-native-ai/dev-tools

**See every Vercel AI SDK call your React Native app makes.**

The AI SDK Profiler is a [Rozenite](https://www.rozenite.dev) DevTools plugin.
It captures the OpenTelemetry spans the AI SDK emits and shows their inputs,
outputs, tool calls, provider metadata and latency.

![AI SDK Profiler preview](../../website/src/public/dev-tools-preview.png)

DevTools are runtime agnostic, so they work with on-device and remote runtimes.

## Installation

```bash
npm install @react-native-ai/dev-tools @ai-sdk/otel
```

## Rozenite setup

This plugin requires Rozenite to be installed and enabled in your app.
Follow the Rozenite getting started guide to install and configure it:
https://www.rozenite.dev/docs/getting-started

## Quick Start

### 1. Initialize the tracer and DevTools hook

```tsx
import { getAiSdkTracer, useAiSdkDevTools } from '@react-native-ai/dev-tools'

export function App() {
  useAiSdkDevTools()
  return <RootNavigator />
}
```

### 2. Enable AI SDK telemetry on requests

```ts
import { OpenTelemetry } from '@ai-sdk/otel'
import { generateText, registerTelemetry } from 'ai'
import { openai } from '@ai-sdk/openai'
import { getAiSdkTracer } from '@react-native-ai/dev-tools'

// Register once, at app startup
registerTelemetry(
  new OpenTelemetry({
    tracer: getAiSdkTracer({ serviceName: 'my-app' }),
  })
)

await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'Write a short story about a cat.',
  telemetry: {
    functionId: 'unique-identifier-where-the-call-comes-from',
  },
})
```

### 3. Open DevTools

Start your development server and open Rozenite DevTools. Select
**AI SDK Profiler** to inspect the spans.
