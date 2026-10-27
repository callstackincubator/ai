---
title: "Models & Availability"
---

The ADK provider runs on-device Gemini Nano by default, and cloud Gemini when you configure an API key.

## Available Model Types

| Model Type            | `modelType`  | Default Name       | Use Case                                                           |
| --------------------- | ------------ | ------------------ | ------------------------------------------------------------------ |
| On-device Gemini Nano | `genai-nano` | `gemini-nano`      | Private, offline-capable inference - system-provisioned via AICore |
| Cloud Gemini          | `gemini`     | `gemini-2.5-flash` | Cloud inference via Google AI API                                  |

## On-device Gemini Nano

Gemini Nano runs locally via ML Kit GenAI and is provisioned by the Android system (AICore). The default `adk()` export already targets Nano — check availability and prepare before generating:

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

const supported = await adk.isNanoSupported()
if (!supported) throw new Error('Gemini Nano not supported on this device')

const ready = await adk.isAvailable('genai-nano')
if (!ready) throw new Error('Gemini Nano not ready yet')

await adk.prepareNano()

const { text } = await generateText({
  model: adk(),
  prompt: 'Summarize on-device AI in one sentence.',
})
```

To customize the system instruction or register tool executors, create a provider with `createAdkProvider`:

```typescript
import { createAdkProvider } from '@react-native-ai/adk'
import { generateText } from 'ai'

const adk = createAdkProvider({
  modelType: 'genai-nano',
  modelName: 'gemini-nano',
  instruction: 'You are a helpful assistant.',
})

await adk.prepareNano()

const { text } = await generateText({
  model: adk(),
  prompt: 'Summarize on-device AI in one sentence.',
})
```

### Availability Check

Nano has two separate checks:

| API                             | Label                 | Question                                   |
| ------------------------------- | --------------------- | ------------------------------------------ |
| `adk.isNanoSupported()`         | **Device capability** | Can this device ever run Nano?             |
| `adk.isAvailable('genai-nano')` | **Runtime readiness** | Can I call `prepareNano()` / generate now? |

If `isNanoSupported()` is `false`, `isAvailable('genai-nano')` is also `false`.

Both checks are cheap native calls (no model download), safe to cache at app startup and re-check after resume.

Both checks use ML Kit `Generation.getClient().checkStatus()`:

| Status         | `isNanoSupported()` | `isAvailable('genai-nano')` | Suggested UX                             |
| -------------- | ------------------- | --------------------------- | ---------------------------------------- |
| `0`            | `false`             | `false`                     | Hide or disable - not supported          |
| `1`            | `true`              | `true`                      | Ready - call `prepareNano()`             |
| `3`            | `true`              | `true`                      | Ready to download - call `prepareNano()` |
| Other non-zero | `true`              | `false`                     | Show disabled - not ready yet            |

If needed, consult the [ML Kit GenAI Prompt API](https://developers.google.com/ml-kit/genai) for details.

### Recommended Flow

```typescript
import { adk } from '@react-native-ai/adk'

const supported = await adk.isNanoSupported()
if (!supported) {
  // Device lacks Gemini Nano / AICore support - hide from model picker
  return
}

const ready = await adk.isAvailable('genai-nano')
if (!ready) {
  // Device supports Nano but ML Kit is not ready yet (e.g. downloading)
  // Show disabled - do not mark as "Ready"
  return
}

await adk.prepareNano()
const model = adk()
```

### Automatic Preparation

`model.prepare()`, `generateText()`, and `streamText()` auto-call `prepareNano()` for `genai-nano` models, but only gate on `isNanoSupported()`. For UI gating, always use `isAvailable('genai-nano')` and handle prepare/generation errors in your chat flow.

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

const model = adk()

// Explicit prepare (initializes Nano via ML Kit)
await model.prepare()

// Or let generation trigger prepare automatically
await generateText({ model, prompt: 'Hello!' })
```

## Cloud Gemini

When you need cloud inference - for example on emulators or devices without AICore - create a provider with `modelType: 'gemini'` and an API key:

```typescript
import { createAdkProvider } from '@react-native-ai/adk'
import { generateText } from 'ai'

const adk = createAdkProvider({
  apiKey: process.env.GOOGLE_API_KEY,
  modelType: 'gemini',
  modelName: 'gemini-2.5-flash',
})

const { text } = await generateText({
  model: adk(),
  prompt: 'What time is it in New York?',
})
```

To customize the system instruction or cloud model name:

```typescript
import { createAdkProvider } from '@react-native-ai/adk'
import { generateText } from 'ai'

const adk = createAdkProvider({
  apiKey: process.env.GOOGLE_API_KEY,
  modelType: 'gemini',
  modelName: 'gemini-2.5-flash',
  instruction: 'You are a helpful assistant.',
})

const { text } = await generateText({
  model: adk(),
  prompt: 'What time is it in New York?',
})
```

> Do not embed API keys in production client apps. Prefer a backend proxy or secure runtime configuration.

Cloud models do not require a separate download or prepare step.

## Custom Provider

Use `createAdkProvider` when you need to change the model type, agent name, system instruction, API key, or registered tool executors. It returns the same callable interface as the default `adk` export - call it to construct a language model:

```typescript
const adk = createAdkProvider({
  name: 'my_agent',
  description: 'A helpful assistant',
  instruction: 'You are a concise, friendly assistant.',
  modelType: 'genai-nano',
  modelName: 'gemini-nano',
})

const model = adk()
// or
const model = adk.languageModel()
```

### Provider Options

| Option           | Type                       | Description                                                                 |
| ---------------- | -------------------------- | --------------------------------------------------------------------------- |
| `name`           | `string`                   | ADK agent name (default: `react_native_adk_agent`)                          |
| `description`    | `string`                   | Agent description shown to ADK                                              |
| `instruction`    | `string`                   | System instruction for the agent                                            |
| `modelType`      | `'genai-nano' \| 'gemini'` | On-device or cloud backend (default: `genai-nano`)                          |
| `modelName`      | `string`                   | Model identifier (default: `gemini-nano`; use `gemini-2.5-flash` for cloud) |
| `apiKey`         | `string`                   | Google AI API key - required for cloud `gemini` only                        |
| `availableTools` | `Record<string, Tool>`     | Tools whose `execute` handlers ADK can call from JavaScript                 |
