# Changelog

Changes to `@react-native-ai/json-ui`.

## Unreleased

### Breaking changes

- Requires AI SDK 7 (`ai@7`). ([#233](https://github.com/callstackincubator/ai/pull/233))

### Fixes

- JSON UI tools work with on-device models ([#275](https://github.com/callstackincubator/ai/pull/275)):
  - Props are accepted as object literals with unquoted keys or single quotes.
  - Invalid props return an error the model can retry instead of ending the generation.
  - Type names match regardless of case, and unknown types list the supported ones.
  - Headings and labels have their own default styles.
  - The system prompt names `getUILayout` instead of a tool that doesn't exist.

## 1.0.0-alpha.1

- First release. It renders a UI that a model builds progressively through tool calls. ([#196](https://github.com/callstackincubator/ai/pull/196))
