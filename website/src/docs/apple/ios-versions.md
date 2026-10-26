# iOS Versions

The Apple provider runs on iOS 26 and iOS 27. Apple added a lot to Foundation
Models in iOS 26.4 and iOS 27, so the same code can behave differently
depending on the device. A feature that Apple only ships in a newer version
either throws `UNSUPPORTED_OS` or is left out of the result.

## What Decides Support

Two things decide whether a feature is available:

- **The iOS version on the device.** It is checked at runtime.
- **The SDK your app is built with.** Newer Apple APIs are only compiled in
  when the SDK has them. If you build with an older SDK, the app behaves as if
  it ran on the older iOS version, even on a newer device.

| Apple APIs | Build with              |
| ---------- | ----------------------- |
| iOS 26.4   | Xcode 26 with Swift 6.3 |
| iOS 27     | Xcode 27 with Swift 6.4 |

## Language Model

Features of `apple()` and `apple('private-cloud-compute')`. Options that ask
for a missing feature (`reasoning`, image parts, the Private Cloud Compute
model, Vision tools, a required or named tool choice, `maxToolCalls`) throw
`UNSUPPORTED_OS`. Missing output, such as reasoning
parts or usage, is left out.

| Feature                                         | iOS 26                        | iOS 26.4                      | iOS 27                        |
| ----------------------------------------------- | ----------------------------- | ----------------------------- | ----------------------------- |
| Text generation and streaming                   | ✅                            | ✅                            | ✅                            |
| Structured output (`Output.object`)             | ✅                            | ✅                            | ✅                            |
| Structured output with `streamText`             | ✅ Sent whole at the end      | ✅ Sent whole at the end      | ✅ Sent whole at the end      |
| JavaScript tools                                | ✅                            | ✅                            | ✅                            |
| Tool calls and results in `generateText`        | ✅                            | ✅                            | ✅                            |
| Tool calls and results while streaming          | ✅ Sent once the tool returns | ✅ Sent once the tool returns | ✅ Sent once the tool returns |
| `toolChoice: 'auto'` and `'none'`               | ✅                            | ✅                            | ✅                            |
| `toolChoice: 'required'`                        | ❌                            | ❌                            | ✅                            |
| `toolChoice` with a named tool                  | ❌                            | ❌                            | ✅                            |
| `maxToolCalls` provider option                  | ❌                            | ❌                            | ✅                            |
| Guardrails (`permissiveContentTransformations`) | ✅                            | ✅                            | ✅                            |
| `countTokens` and `contextSize`                 | ❌                            | ✅                            | ✅                            |
| Reasoning level (`reasoning` option)            | ❌                            | ❌                            | ✅                            |
| Reasoning parts in results and streams          | ❌                            | ❌                            | ✅                            |
| Image prompts                                   | ❌                            | ❌                            | ✅ Final user prompt only     |
| Private Cloud Compute model                     | ❌                            | ❌                            | ✅ Physical device only       |
| Vision OCR and barcode tools                    | ❌                            | ❌                            | ✅ Physical device only       |
| Spotlight search tool                           | ❌                            | ❌                            | ✅ Physical device only       |
| Token usage and `'length'` finish reason        | ❌                            | ❌                            | ✅                            |
| `CONTEXT_WINDOW_EXCEEDED` and `RATE_LIMITED`    | ✅                            | ✅                            | ✅                            |
| Guardrail, refusal, language and asset errors   | ✅                            | ✅                            | ✅                            |
| Timeout and network errors                      | ❌                            | ❌                            | ✅                            |

Notes:

- **Tool choice.** Apple's required mode applies to every request in its tool
  loop, so the model would never answer. On iOS 27 the provider requires a
  tool call only until the model has made one. See [Tools](./tools#tool-choice).
- **Guardrails** apply to the `system` model only. Private Cloud Compute
  ignores them.
- **Streaming tool calls.** `tool-call` and `tool-result` parts are sent
  together once the tool returns, because native runs the tool before the
  provider sees the call.
- **Reasoning.** Transcripts before iOS 27 have no reasoning entries, so
  reasoning parts in the message history are dropped. On iOS 27 they are
  replayed in later turns.
- **Images in history.** Apple only reads images on the prompt being answered.
  Images in earlier user turns are left out on every version.
- **Usage and finish reason.** Before iOS 27 usage is `undefined` and the
  finish reason is always `'stop'`. Apple does not report when a response
  stops at `maxOutputTokens`, so on iOS 27 the finish reason is `'length'` when
  the response used every allowed token.
- **Simulator.** Private Cloud Compute does not run in the iOS Simulator, and
  the simulator SDK does not include the Vision tools.

## Model Info

`apple.getModelInfo()` reports what the current device supports, so you can
check at runtime instead of comparing iOS versions:

| Field                   | iOS 26  | iOS 26.4 | iOS 27                      |
| ----------------------- | ------- | -------- | --------------------------- |
| `contextSize`           | Missing | ✅       | ✅                          |
| `supportsTokenCounting` | `false` | `true`   | `true` for `system` only    |
| `supportsImagePrompts`  | `false` | `false`  | `true`                      |
| `supportsVisionTools`   | `false` | `false`  | `true` on a physical device |
| `supportsSpotlightTool` | `false` | `false`  | `true` on a physical device |

```typescript
import { apple } from '@react-native-ai/apple'

const info = await apple.getModelInfo()

if (info.supportsImagePrompts) {
  // Send image parts
}
```

Use `supportsReasoning` before setting `reasoning`, and `availability` with
`{ model: 'private-cloud-compute' }` before using Private Cloud Compute. Other
features without a flag throw `UNSUPPORTED_OS` when the device or SDK does not
have them.

## Image Generation

`apple.imageModel()` uses Image Playground's `ImageCreator`, which Apple added
in iOS 26.4 and discontinued in iOS 27. It throws `UNSUPPORTED_OS` on other
versions, and is deprecated.

| Feature                                   | iOS 26 | iOS 26.4                     | iOS 27 |
| ----------------------------------------- | ------ | ---------------------------- | ------ |
| Image generation                          | ❌     | ✅                           | ❌     |
| `animation`, `illustration`, `sketch`     | ❌     | ✅                           | ❌     |
| `any`, `emoji`, `externalProvider` styles | ❌     | Falls back to `illustration` | ❌     |
| `personalization` option                  | ❌     | ✅                           | ❌     |

## Other Models

These models do not use Foundation Models and have their own minimum versions:

| Model         | Minimum iOS                     |
| ------------- | ------------------------------- |
| Transcription | iOS 26                          |
| Embeddings    | iOS 17                          |
| Speech        | Any, Personal Voice from iOS 17 |
