---
title: "Models & Availability"
---

`adk()` runs Gemini Nano on the device. Android provides it through AICore, so
there's nothing to bundle and no API key, but only some devices can run it.

## Availability

Check before you offer Gemini Nano in your app. `adk.getModelInfo()` reports
ML Kit's status for the model:

```typescript
import { adk } from '@react-native-ai/adk'

const info = await adk.getModelInfo()

switch (info.availability) {
  case 'available':
    // Ready to generate
    break
  case 'downloadable':
    // Supported: prepare() downloads it
    break
  case 'downloading':
    // Android is downloading it, show it as not ready yet
    break
  case 'unavailable':
  case 'unknown':
    // This device can't run Gemini Nano, hide it
    break
}
```

When Gemini Nano is `available`, `getModelInfo()` also returns `baseModelName`
and `contextSize`, its input token limit.

`adk.isAvailable()` is the yes/no version: it's `true` when Gemini Nano is
`available` or `downloadable`. Both are cheap, never download anything, and are
safe to call at startup and again when the app resumes. See the
[ML Kit GenAI documentation](https://developers.google.com/ml-kit/genai#feature-device)
for the supported devices.

## Preparing

`prepare()` downloads Gemini Nano when needed and loads it, so the first
request doesn't wait. It can report download progress:

```typescript
import { adk } from '@react-native-ai/adk'

const model = adk()

await model.prepare({
  onProgress: ({ phase, bytesDownloaded, bytesToDownload }) => {
    // phase is 'started', 'progress' or 'completed'
  },
})
```

If you skip it, the first `generateText` or `streamText` call prepares the
model. Preparing fails with `MODEL_UNAVAILABLE` on devices that can't run
Gemini Nano, and with `MODEL_DOWNLOADING` while Android is still downloading
it.

## Model Selection

ML Kit can run the preview Gemini Nano model, which needs the AICore developer
preview, and can favor speed or quality:

```typescript
import { createAdkProvider } from '@react-native-ai/adk'

const adk = createAdkProvider({
  nano: { releaseStage: 'preview', preference: 'full' },
})
```

## Token Counting

`countTokens` counts tokens with the Gemini Nano tokenizer, for example to
check a prompt against `contextSize`:

```typescript
const tokens = await adk().countTokens('How long is this prompt?')
```

## What Gemini Nano Supports

ADK runs Gemini Nano through ML Kit's Prompt API, which supports text and image
prompts, streaming, `temperature`, `topK` and `maxOutputTokens`. ADK's ML Kit
model has no tool calling or structured output yet: tools and JSON output
return an `unsupported` warning, and so do `topP`, `seed`, stop sequences and
penalties.

## Provider Options

`createAdkProvider` creates a provider with its own defaults, and `adk()` takes
the same options for a single model:

```typescript
import { createAdkProvider } from '@react-native-ai/adk'

const adk = createAdkProvider({
  instruction: 'You are a concise, friendly assistant.',
})
```

| Option        | Type     | Description                                        |
| ------------- | -------- | -------------------------------------------------- |
| `instruction` | `string` | System instruction                                 |
| `nano`        | `object` | Gemini Nano [model selection](#model-selection)    |
| `name`        | `string` | ADK agent name (default: `react_native_adk_agent`) |
| `description` | `string` | ADK agent description                              |

`adk()` also takes the model id, `adk('gemini-nano')`, as AI SDK providers do.
Any other id throws the AI SDK's `NoSuchModelError`, since ADK only runs Gemini
Nano.
