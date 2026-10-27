---
title: "Error Handling"
---

Errors from Foundation Models carry a stable `code` you can use for control
flow. Other errors, such as a tool that is not registered or a code this
version of the library does not know, are plain `Error`s without one, so check
`code` before relying on it.

## Content Filters

When Apple's guardrails flag a prompt or response, or the model refuses, the
response ends like other providers' content filters instead of throwing.
`finishReason` is `'content-filter'`, with `GUARDRAIL_VIOLATION` or `REFUSAL`
as its raw value, and text already streamed before it is kept. The low-level
`AppleFoundationModels` API rejects with those codes instead.

## Catching Errors

```typescript
import {
  AppleLLMErrorCodes,
  type AppleLLMError,
  apple,
} from '@react-native-ai/apple'
import { generateText, streamText } from 'ai'

try {
  await generateText({
    model: apple(),
    messages,
  })
} catch (error) {
  const { code } = error as Partial<AppleLLMError>

  if (code === AppleLLMErrorCodes.ContextWindowExceeded) {
    // Retry with a smaller transcript or a summary.
  }

  throw error
}
```

With `streamText`, errors arrive as `error` parts in `stream`:

```typescript
const result = streamText({
  model: apple(),
  messages,
})

for await (const part of result.stream) {
  if (part.type === 'error') {
    const { code } = part.error as Partial<AppleLLMError>

    if (code === AppleLLMErrorCodes.ModelUnavailable) {
      // Show fallback UI.
    }
  }
}
```

## Error Codes

| Code                           | Meaning                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `MODEL_UNAVAILABLE`            | The model is not available, see `getModelInfo` for why           |
| `UNSUPPORTED_OS`               | The feature needs a newer iOS version or SDK                     |
| `GENERATION_ERROR`             | Any other generation failure                                     |
| `INVALID_MESSAGE`              | The prompt cannot be sent to Foundation Models                   |
| `CONFLICTING_SAMPLING_METHODS` | Both `topP` and `topK` were set                                  |
| `INVALID_SCHEMA`               | The schema or one of its constraints is not supported            |
| `TOOL_CALL_ERROR`              | A tool threw                                                     |
| `UNKNOWN_TOOL_CALL_ERROR`      | A tool returned something that is not text or JSON               |
| `CONTEXT_WINDOW_EXCEEDED`      | The transcript does not fit in the context window                |
| `RATE_LIMITED`                 | Too many requests, or the Private Cloud Compute quota is reached |
| `GUARDRAIL_VIOLATION`          | Apple's guardrails flagged the prompt or response                |
| `REFUSAL`                      | The model refused to answer                                      |
| `UNSUPPORTED_LANGUAGE`         | The model does not support the language of the prompt            |
| `ASSETS_UNAVAILABLE`           | The model's assets are not on the device yet                     |
| `CONCURRENT_REQUESTS`          | The model is busy with another request                           |
| `DECODING_FAILURE`             | The model could not produce output that matches the schema       |
| `TIMEOUT`                      | The request took too long (iOS 27)                               |
| `NETWORK_FAILURE`              | Private Cloud Compute could not be reached                       |
| `SERVICE_UNAVAILABLE`          | Private Cloud Compute is temporarily unavailable                 |
