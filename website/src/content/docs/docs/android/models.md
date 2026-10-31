---
title: "Models & Availability"
---

Gemini Nano comes with AICore, Android's system service for on-device models.
AICore downloads it on first use and updates it on its own.

## Checking Availability

`getModelInfo()` checks with AICore:

```typescript
import { android } from '@react-native-ai/android'

const info = await android.getModelInfo()
// {
//   availability: 'available',
//   baseModelName: 'nano-v2',
//   contextSize: 8192,
//   features: ['systemPrompt', 'thinking', 'structuredOutput', 'functionCalling'],
// }
```

| `availability` | Meaning |
| --- | --- |
| `available` | Ready to use |
| `downloadable` | Supported, and downloads with `prepare()` |
| `downloading` | Downloading now |
| `unavailable` | Not supported on this device |
| `unknown` | AICore didn't answer |

`baseModelName`, `contextSize` and `features` are only set once the model is
available.

## Preparing

`prepare()` downloads Gemini Nano when needed and loads it into memory, so the
first request answers sooner. Generating prepares on its own when you don't, and logs a warning.

```typescript
await android().prepare({
  onProgress: ({ phase, bytesDownloaded, bytesToDownload }) => {
    console.log(phase, bytesDownloaded, bytesToDownload)
  },
})
```

## Choosing a Model

ML Kit's `ModelConfig` picks between Gemini Nano releases:

```typescript
import { createAndroidProvider } from '@react-native-ai/android'

const preview = createAndroidProvider({
  model: { releaseStage: 'preview', preference: 'fast' },
})
```

- `releaseStage`: `stable` (default) or `preview`, the newest Gemini Nano for
  devices in the AICore developer preview
- `preference`: `full` (default) favors quality, `fast` favors latency

[Tool calling](/docs/android/tools) needs Gemini Nano 4: the preview release
with `fast`, or the default model on devices that ship it, such as the Galaxy Z
Flip 8 and Fold 8.
`getModelInfo` takes the same selection.
