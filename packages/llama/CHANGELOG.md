# Changelog

Changes to `@react-native-ai/llama`. For 0.12.0 and earlier, see the [GitHub releases](https://github.com/callstackincubator/ai/releases).

## Unreleased

### Breaking changes

- Requires AI SDK 7 (`ai@7`) and `llama.rn` 0.13.0-rc.8 or later. ([#233](https://github.com/callstackincubator/ai/pull/233))

### Deprecations

- `textEmbeddingModel()` and `rerankModel()` are deprecated in favor of `embeddingModel()` and `rerankingModel()`. ([#251](https://github.com/callstackincubator/ai/pull/251))

### Features

- Reasoning, structured output and multimodal input for AI SDK 7 ([#239](https://github.com/callstackincubator/ai/pull/239)):
  - The `reasoning` call option maps to llama.rn thinking and its token budget.
  - Images and audio stay in the same message as their text.
- Token counting with `llama.languageModel(...).countTokens(text)`. ([#251](https://github.com/callstackincubator/ai/pull/251))
- The `projectorImageMaxTokens` option, which caps the tokens an image can use. ([#270](https://github.com/callstackincubator/ai/pull/270))

### Fixes

- Tools are sent with their argument schema, and a named `toolChoice` is supported. ([#239](https://github.com/callstackincubator/ai/pull/239))
- `toolChoice: 'none'` keeps tools out of the prompt. ([#270](https://github.com/callstackincubator/ai/pull/270))
- Aborting `generateText` or a stream stops native generation and rejects. ([#239](https://github.com/callstackincubator/ai/pull/239), [#270](https://github.com/callstackincubator/ai/pull/270))
- Fixed these crashes and freezes ([#270](https://github.com/callstackincubator/ai/pull/270)):
  - two concurrent `prepare()` calls
  - the second step of a tool call on hybrid models
  - aborting a stream
  - structured output with thinking turned on
  - full-resolution photos
- `maxOutputTokens` no longer carries over from one call to the next. ([#270](https://github.com/callstackincubator/ai/pull/270))
- Structured output returns its JSON. ([#270](https://github.com/callstackincubator/ai/pull/270))
- Speech is returned as 16-bit WAV instead of silence. ([#270](https://github.com/callstackincubator/ai/pull/270))
- `embedMany` works with more than 8 values. ([#270](https://github.com/callstackincubator/ai/pull/270))
- Reasoning is returned before the answer. ([#270](https://github.com/callstackincubator/ai/pull/270))
- Think tokens split correctly when streaming. ([#214](https://github.com/callstackincubator/ai/pull/214), [#216](https://github.com/callstackincubator/ai/pull/216))
- Provider options reach native code. ([#216](https://github.com/callstackincubator/ai/pull/216))
- A download that fails midway is no longer reported as downloaded. ([#270](https://github.com/callstackincubator/ai/pull/270))
- Unknown token usage is reported as `undefined` instead of `0`. ([#251](https://github.com/callstackincubator/ai/pull/251))
