# Changelog

Changes to `@react-native-ai/apple`. For 0.12.0 and earlier, see the [GitHub releases](https://github.com/callstackincubator/ai/releases).

## 0.13.0 (2026-11-11)

### Breaking changes

- Requires AI SDK 7 (`ai@7`). The provider now implements the v4 provider specification. ([#233](https://github.com/callstackincubator/ai/pull/233))
- Removed `apple.isAvailable()`, `apple.transcriptionModel().isAvailable()` and `AppleTranscription.isAvailable()`. Use `getModelInfo()` instead. It rejects with `UNSUPPORTED_OS` on versions before iOS 26. ([#370](https://github.com/callstackincubator/ai/pull/370))
- `AppleEmbeddings.getInfo()` is now `AppleEmbeddings.getModelInfo()`, and the `EmbeddingInfo` type is now `AppleEmbeddingModelInfo`. ([#333](https://github.com/callstackincubator/ai/pull/333))
- `AppleFoundationModels.generateText` now resolves to `{ content, usage }` instead of an array of parts. ([#251](https://github.com/callstackincubator/ai/pull/251))

### Deprecations

- `apple.textEmbeddingModel()` is deprecated in favor of `apple.embeddingModel()`. ([#251](https://github.com/callstackincubator/ai/pull/251))

### Features

- iOS 27 and WWDC26 Apple Intelligence APIs ([#218](https://github.com/callstackincubator/ai/pull/218)):
  - Private Cloud Compute, selected with `providerOptions.apple.model` or `createAppleProvider({ model })`.
  - `apple.getModelInfo({ locale, model })`, which reports availability, supported languages, context size and capabilities.
  - Image prompts. `image/*` file parts are sent to Foundation Models as attachments.
  - Image Playground generation through `apple.imageModel()`.
  - The Vision `OCRTool` and `BarcodeReaderTool` built-in tools, through `providerOptions.apple.builtInTools`.
  - Builds with Xcode 27 and still builds with Xcode 26.
- The `reasoningLevel` provider option on iOS 27. The AI SDK `reasoning` call option maps to it. ([#232](https://github.com/callstackincubator/ai/pull/232), [#233](https://github.com/callstackincubator/ai/pull/233))
- Stable error codes on `AppleLLMError.code`, including `CONTEXT_WINDOW_EXCEEDED` and `RATE_LIMITED`. Foundation Models failures get their own codes. ([#212](https://github.com/callstackincubator/ai/pull/212), [#213](https://github.com/callstackincubator/ai/pull/213), [#232](https://github.com/callstackincubator/ai/pull/232), [#320](https://github.com/callstackincubator/ai/pull/320))
- Token counting with `apple().countTokens(text)` and `AppleFoundationModels.countTokens`. ([#212](https://github.com/callstackincubator/ai/pull/212), [#251](https://github.com/callstackincubator/ai/pull/251))
- Token usage reporting. iOS 27 reports usage natively, and iOS 26.4 counts it with the on-device tokenizer. A length limit is reported as the `length` finish reason. ([#251](https://github.com/callstackincubator/ai/pull/251), [#258](https://github.com/callstackincubator/ai/pull/258))
- Tool call ids, reasoning and tool parts in results and streams, with assistant and tool messages replayed as a structured transcript. ([#240](https://github.com/callstackincubator/ai/pull/240))
- Tool calls stream on iOS 26, and `streamText` works with `Output.object`. ([#251](https://github.com/callstackincubator/ai/pull/251))
- `required` and named `toolChoice`, and the `maxToolCalls` provider option, on iOS 27. ([#265](https://github.com/callstackincubator/ai/pull/265), [#266](https://github.com/callstackincubator/ai/pull/266))
- The `guardrails` option on `createAppleProvider`. Guardrail violations and refusals finish with `content-filter`. ([#228](https://github.com/callstackincubator/ai/pull/228), [#321](https://github.com/callstackincubator/ai/pull/321))
- `getModelInfo()` reports why a model is unavailable. Private Cloud Compute quota is reported too. ([#249](https://github.com/callstackincubator/ai/pull/249), [#329](https://github.com/callstackincubator/ai/pull/329))
- An Expo config plugin that enables Private Cloud Compute: `["@react-native-ai/apple", { "privateCloudCompute": true }]`. ([#279](https://github.com/callstackincubator/ai/pull/279))
- References in generation schemas. ([#314](https://github.com/callstackincubator/ai/pull/314))
- The `seed` call setting. ([#322](https://github.com/callstackincubator/ai/pull/322))
- `prepare()` prewarms the language model. ([#323](https://github.com/callstackincubator/ai/pull/323))
- The content tagging use case. ([#324](https://github.com/callstackincubator/ai/pull/324))
- The Spotlight search built-in tool. ([#328](https://github.com/callstackincubator/ai/pull/328))
- Transcription now includes:
  - word timings ([#325](https://github.com/callstackincubator/ai/pull/325))
  - live microphone transcription on iOS 27 ([#330](https://github.com/callstackincubator/ai/pull/330))
  - streaming transcription of recorded audio ([#337](https://github.com/callstackincubator/ai/pull/337))
- Speech speed is applied as the utterance rate. ([#317](https://github.com/callstackincubator/ai/pull/317))
- `apple.embeddingModel().getModelInfo()`. ([#333](https://github.com/callstackincubator/ai/pull/333))
- `updateTools()` on the provider for replacing registered tools at runtime. ([#196](https://github.com/callstackincubator/ai/pull/196))

### Fixes

- Generation schemas:
  - keep every numeric bound ([#252](https://github.com/callstackincubator/ai/pull/252))
  - constrain numeric enums and handle fractional values ([#253](https://github.com/callstackincubator/ai/pull/253), [#294](https://github.com/callstackincubator/ai/pull/294))
  - give nested schemas unique names ([#277](https://github.com/callstackincubator/ai/pull/277))
  - keep properties in declaration order ([#313](https://github.com/callstackincubator/ai/pull/313))
- Tools:
  - failures are reported as tool call errors ([#254](https://github.com/callstackincubator/ai/pull/254))
  - an unknown tool gets a hint on how to register it ([#283](https://github.com/callstackincubator/ai/pull/283))
  - a tool that is no longer registered no longer hangs the native call ([#240](https://github.com/callstackincubator/ai/pull/240))
- Call settings:
  - reasoning settings now reach native code ([#240](https://github.com/callstackincubator/ai/pull/240))
  - reasoning is dropped for models that can't reason ([#281](https://github.com/callstackincubator/ai/pull/281))
  - temperature works without `topP` or `topK` ([#310](https://github.com/callstackincubator/ai/pull/310))
  - call settings that Foundation Models ignores now return warnings ([#282](https://github.com/callstackincubator/ai/pull/282))
- `generateText` can be aborted. ([#280](https://github.com/callstackincubator/ai/pull/280))
- Availability is checked for the requested model instead of always the on-device model. ([#232](https://github.com/callstackincubator/ai/pull/232))
- iOS 26 rate limits are reported as `RATE_LIMITED`. ([#262](https://github.com/callstackincubator/ai/pull/262))
- Private Cloud Compute is reported as unavailable when the entitlement is missing. ([#278](https://github.com/callstackincubator/ai/pull/278))
- Image attachments are labeled, including images without a filename, so vision tools can find them. ([#264](https://github.com/callstackincubator/ai/pull/264), [#284](https://github.com/callstackincubator/ai/pull/284))
- Image generation is reported as unsupported on iOS 27. ([#311](https://github.com/callstackincubator/ai/pull/311))
- Transcription:
  - reports the language as a language code ([#285](https://github.com/callstackincubator/ai/pull/285))
  - resolves languages to supported locales ([#319](https://github.com/callstackincubator/ai/pull/319))
  - sends only the audio view's bytes ([#256](https://github.com/callstackincubator/ai/pull/256))
- The current locale is returned as a BCP 47 code without keywords. ([#334](https://github.com/callstackincubator/ai/pull/334))
- Speech:
  - uses the language of the call ([#316](https://github.com/callstackincubator/ai/pull/316))
  - asks for Personal Voice access only when requested ([#318](https://github.com/callstackincubator/ai/pull/318))
  - sends voice quality as a string ([#255](https://github.com/callstackincubator/ai/pull/255))
  - settles for whitespace-only text ([#231](https://github.com/callstackincubator/ai/pull/231))
- Embedding text with no tokens returns a zero vector. ([#257](https://github.com/callstackincubator/ai/pull/257))
