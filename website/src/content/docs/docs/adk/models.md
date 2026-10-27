---
title: "Models & Availability"
---

`adk()` runs Gemini Nano on the device. Android provides it through AICore, so
there's nothing to download or bundle, but only some devices can run it. When
you need a larger model, or support for every device, use cloud Gemini.

| Model        | `modelType`  | Default `modelName` | Runs                             |
| ------------ | ------------ | ------------------- | -------------------------------- |
| Gemini Nano  | `genai-nano` | `gemini-nano`       | On device, offline, no API key   |
| Cloud Gemini | `gemini`     | `gemini-2.5-flash`  | Google AI API, with your API key |

## Gemini Nano

### Availability Check

Check before you offer Gemini Nano in your app. There are two checks, both
cheap and safe to run at startup and again when the app resumes:

| Call                            | Answers                                          |
| ------------------------------- | ------------------------------------------------ |
| `adk.isNanoSupported()`         | Can this device ever run Gemini Nano?            |
| `adk.isAvailable('genai-nano')` | Can it run now, or is it still being downloaded? |

```typescript
import { adk } from '@react-native-ai/adk'

if (!(await adk.isNanoSupported())) {
  // Hide Gemini Nano: this device can't run it
  return
}

if (!(await adk.isAvailable('genai-nano'))) {
  // Show it as not ready yet, for example while Android downloads it
  return
}

await adk.prepareNano()
const model = adk()
```

Both are based on ML Kit's model status. See the
[ML Kit GenAI documentation](https://developers.google.com/ml-kit/genai#feature-device)
for the supported devices.

### Preparing

`adk.prepareNano()` or `model.prepare()` loads Gemini Nano ahead of time. If you
skip it, the first `generateText` or `streamText` call prepares it. That call
only checks `isNanoSupported()`, so check `isAvailable('genai-nano')` yourself
before showing the model as ready, and handle errors in your chat flow.

## Cloud Gemini

Use cloud Gemini on devices without Gemini Nano, on the emulator, or when you
need a more capable model. Create a provider with `modelType: 'gemini'` and
your API key:

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

Cloud models need no download or prepare step.

:::caution
Don't ship API keys in your app. Use a backend proxy or load the key securely
at runtime.
:::

## Provider Options

`createAdkProvider` creates a provider with its own settings, for example a
system instruction:

```typescript
import { createAdkProvider } from '@react-native-ai/adk'

const adk = createAdkProvider({
  instruction: 'You are a concise, friendly assistant.',
})

const model = adk()
```

| Option           | Type                       | Description                                                       |
| ---------------- | -------------------------- | ----------------------------------------------------------------- |
| `modelType`      | `'genai-nano' \| 'gemini'` | On device or cloud (default: `genai-nano`)                        |
| `modelName`      | `string`                   | Model name (default: `gemini-nano`)                               |
| `apiKey`         | `string`                   | Google AI API key, for cloud Gemini only                          |
| `instruction`    | `string`                   | System instruction                                                |
| `availableTools` | `Record<string, Tool>`     | Tools ADK can call, see [Tool Calling](/docs/adk/generating#tool-calling) |
| `name`           | `string`                   | ADK agent name (default: `react_native_adk_agent`)                |
| `description`    | `string`                   | ADK agent description                                             |
