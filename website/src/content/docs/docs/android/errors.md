---
title: "Error Handling"
---

Errors from ML Kit carry a stable `code` from `AndroidAIErrorCodes` you can
branch on.

## Catching Errors

```typescript
import {
  AndroidAIErrorCodes,
  type AndroidAIError,
  android,
} from '@react-native-ai/android'
import { generateText, streamText } from 'ai'

try {
  await generateText({
    model: android(),
    messages,
  })
} catch (error) {
  const { code } = error as Partial<AndroidAIError>

  if (code === AndroidAIErrorCodes.RateLimited) {
    // Wait a few seconds and retry.
  }

  throw error
}
```

With `streamText`, errors arrive as `error` parts in `stream`:

```typescript
const result = streamText({
  model: android(),
  messages,
})

for await (const part of result.stream) {
  if (part.type === 'error') {
    const { code } = part.error as Partial<AndroidAIError>

    if (code === AndroidAIErrorCodes.ModelUnavailable) {
      // Show fallback UI.
    }
  }
}
```

AICore rejects requests an app sends in quick succession, so space out
automated requests by a few seconds.

## Error Codes

| Code                      | Meaning                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| `MODEL_UNAVAILABLE`       | The device can't run the model, or needs an AICore or system update |
| `MODEL_DOWNLOADING`       | The model is still downloading                                      |
| `DOWNLOAD_FAILED`         | Downloading the model failed                                        |
| `FEATURE_NOT_SUPPORTED`   | ML Kit reports the request needs a feature the model doesn't have   |
| `RATE_LIMITED`            | AICore is busy or the app used up its quota                         |
| `BACKGROUND_USE_BLOCKED`  | AICore only serves apps in the foreground                           |
| `CONTEXT_WINDOW_EXCEEDED` | The request is longer than the context window                       |
| `INVALID_MESSAGE`         | The prompt has something Gemini Nano can't take, such as audio      |
| `INVALID_SCHEMA`          | A tool's JSON Schema can't be converted                             |
| `MAX_TURNS_EXCEEDED`      | ML Kit's limit on turns was reached                                 |
| `UNSUPPORTED_PLATFORM`    | The provider was called on a platform other than Android            |
| `GENERATION_ERROR`        | Any other failure                                                   |
