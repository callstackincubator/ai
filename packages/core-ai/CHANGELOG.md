# Changelog

Changes to `@react-native-ai/core-ai`.

## 0.13.0 (2026-11-11)

This is the first release. It is an AI SDK provider for Apple Core AI model bundles exported with [`apple/coreai-models`](https://github.com/apple/coreai-models). It requires iOS 27, runs on physical devices only, and has `@react-native-ai/apple` as a peer dependency.

### Features

- Language models ([#219](https://github.com/callstackincubator/ai/pull/219), [#245](https://github.com/callstackincubator/ai/pull/245), [#326](https://github.com/callstackincubator/ai/pull/326), [#338](https://github.com/callstackincubator/ai/pull/338)) support:
  - generation and streaming
  - persistent sessions
  - structured output
  - the `reasoning` option
  - function tools
  - image prompts with vision language bundles
- Image generation with FLUX.2 and Sana Sprint, including FLUX.2 klein 4B on iPhone. ([#219](https://github.com/callstackincubator/ai/pull/219), [#295](https://github.com/callstackincubator/ai/pull/295))
- Video generation with Wan 2.1. ([#309](https://github.com/callstackincubator/ai/pull/309))
- Speech transcription with coreai-models speech bundles. ([#299](https://github.com/callstackincubator/ai/pull/299))
- Text and image embeddings with CLIP exports. ([#302](https://github.com/callstackincubator/ai/pull/302))
- Image upscaling, classification and depth estimation. ([#301](https://github.com/callstackincubator/ai/pull/301))
- Segmentation and object detection, including tracking objects through videos. ([#219](https://github.com/callstackincubator/ai/pull/219), [#303](https://github.com/callstackincubator/ai/pull/303))
- Raw `.aimodel` function calls with tensors and image inputs, through the `CoreAI` native module. ([#300](https://github.com/callstackincubator/ai/pull/300), [#315](https://github.com/callstackincubator/ai/pull/315))
- Model `source` is one string. It takes a path, a `file://` URL, or `bundle://` for models shipped in the app. ([#345](https://github.com/callstackincubator/ai/pull/345))
- An Expo config plugin. It sets the iOS 27 deployment target, links only the `tasks` you list, and has an `increasedMemoryLimit` option. ([#245](https://github.com/callstackincubator/ai/pull/245), [#331](https://github.com/callstackincubator/ai/pull/331))
