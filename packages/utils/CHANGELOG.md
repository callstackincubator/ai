# Changelog

Changes to `@react-native-ai/utils`.

## Unreleased

This is the first release. It holds model-agnostic helpers for AI SDK language models.

### Features

- `wrapLanguageModelWithHistory`, which keeps long conversations within a model's context ([#218](https://github.com/callstackincubator/ai/pull/218), [#263](https://github.com/callstackincubator/ai/pull/263), [#296](https://github.com/callstackincubator/ai/pull/296)):
  - It summarizes older messages, using the model's `countTokens` when the model has it.
  - It keeps a rolling window of messages.
  - It drops completed tool calls from earlier turns.
