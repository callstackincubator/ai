# Changelog

Changes to `@react-native-ai/android`.

## 0.13.0 (2026-11-11)

This is the first release. It is an AI SDK provider for Gemini Nano built on ML Kit GenAI. ([#367](https://github.com/callstackincubator/ai/pull/367))

### Features

- Generation, streaming and image prompts with Gemini Nano.
- Tool calling, on Gemini Nano 4.
- Transcription and embeddings.
- `getModelInfo()`, which reports whether the model is available, downloadable or downloading. ([#370](https://github.com/callstackincubator/ai/pull/370))
- Options that ML Kit doesn't support return an `unsupported` warning instead of failing the request.

### Migrating from `@react-native-ai/adk`

This package replaces `@react-native-ai/adk`, which is no longer maintained. ([#368](https://github.com/callstackincubator/ai/pull/368))

- Replace `adk()` with `android()`.
- For cloud Gemini, use `@react-native-firebase/ai`, because Google's Gen AI SDK refuses API keys on Android.
