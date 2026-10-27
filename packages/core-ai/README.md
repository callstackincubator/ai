# @react-native-ai/core-ai

Apple Core AI provider for React Native AI.

> [!WARNING]
> Work in progress. This package is not published to npm yet.
> Its docs live in [`docs/`](./docs) until it is released.

This package is for app-provided Core AI model bundles exported from
[`apple/coreai-models`](https://github.com/apple/coreai-models). It is separate
from `@react-native-ai/apple`, which wraps Apple system capabilities such as
Foundation Models, NLContextualEmbedding, SpeechAnalyzer, and AVSpeechSynthesizer.

## API Layers

Core AI exposes two layers:

- AI SDK adapters: language models, image generation and transcription. The
  text embedding adapter exists, because Apple has starter export recipes for
  it, but rejects with an unsupported error until its native runner lands
  ([#237](https://github.com/callstackincubator/ai/issues/237)).
- Direct native APIs: model loading, persistent language sessions, model
  inspection, segmentation, object detection, super-resolution,
  classification, depth estimation, and raw `.aimodel` function calls.
  `specializeModel` returns metadata only.

Reranking, speech generation, and video generation have no adapters, because
`coreai-models` has no runtime for them yet.

## Installation

```bash
npm install @react-native-ai/core-ai @react-native-ai/apple
```

`@react-native-ai/apple` is a peer dependency. To use the AI SDK functions (`generateText`, `streamText`, `generateImage`), also install `ai` v7.

Requirements:

- React Native New Architecture
- Xcode 27 or newer
- iOS 27 or newer, on a physical device
- Model bundles exported with [`apple/coreai-models`](https://github.com/apple/coreai-models) (see [starter models](./docs/models.md))

## Native Setup

The pod links Apple's [`coreai-models`](https://github.com/apple/coreai-models) Swift Package (1.0.0 up to the next major version) during `pod install`, so there is no Xcode step. It also depends on the `AppleLLM` pod from `@react-native-ai/apple`, because Core AI language models run through the same Foundation Models session as Apple Intelligence.

Apple's package needs an **iOS 27 deployment target** and has no iOS Simulator support (the Simulator SDK has no `CoreAI` framework), so apps with this package build for **physical devices only**.

### Expo

Add the config plugin to `app.json`, then run `npx expo prebuild`:

```json
{
  "expo": {
    "plugins": ["@react-native-ai/core-ai"]
  }
}
```

The plugin sets the iOS deployment target to 27.0 in the Podfile and the Xcode project. If you also set `ios.deploymentTarget` in `expo-build-properties`, make it `27.0` or higher.

### Bare React Native

Set `platform :ios, '27.0'` in `ios/Podfile` and the deployment target of the app target in Xcode to 27.0, then run `npx pod-install`.

### Choosing Tasks

By default the pod links native support for every task the module implements. Each task links one `coreai-models` product:

| Task               | Used by                                   | Linked product          |
| ------------------ | ----------------------------------------- | ----------------------- |
| `language`         | `coreAI.languageModel(...)` and sessions  | `CoreAILM`              |
| `diffusion`        | `coreAI.imageModel(...)`                  | `CoreAIDiffusion`       |
| `segmentation`     | `CoreAI.runTask('segmentation', ...)`     | `CoreAISegmentation`    |
| `object-detection` | `CoreAI.runTask('object-detection', ...)` | `CoreAIObjectDetection` |
| `asr`              | `coreAI.transcriptionModel(...)`          | `CoreAISpeech`          |

To link fewer, list the tasks you use. With Expo, pass them to the plugin:

```json
{
  "expo": {
    "plugins": [["@react-native-ai/core-ai", { "tasks": ["language"] }]]
  }
}
```

In a bare app, set `CORE_AI_TASKS` (comma-separated) on every `pod install`:

```bash
CORE_AI_TASKS=language npx pod-install
```

Calls for a task that isn't linked reject with `CORE_AI_MISSING_SPM_PRODUCT`.

## Usage

```ts
import { coreAI } from '@react-native-ai/core-ai'
import { streamText } from 'ai'

const model = coreAI.languageModel({
  id: 'qwen3-0.6b',
  source: { type: 'file', uri: qwen3ModelDirectory },
  variant: 'iOS',
})

const result = streamText({
  model,
  prompt: 'Explain Core AI in one sentence.',
})
```

For persistent native sessions:

```ts
await model.prepare()

const session = await model.createSession({
  instructions: 'Answer tersely.',
})

const response = await session.respond('What is Qwen3?')
```

For lower-level calls, import `CoreAI` and call the native TurboModule directly:

```ts
import { CoreAI, toNativeModelConfig } from '@react-native-ai/core-ai'

await CoreAI.inspectModel(toNativeModelConfig(modelConfig))
```

## Loading Models

Core AI loads models from local `.aimodel` / `.aimodelc` files, so download them into app storage yourself and pass a local `source: { type: 'file', uri }`. Built-in download, specialization and caching is tracked in [#235](https://github.com/callstackincubator/ai/issues/235).

## Documentation

- [Getting started](./docs/getting-started.md): installation, native setup and a first model
- [API surface](./docs/api.md): AI SDK adapters, native sessions and direct native calls
- [Starter models](./docs/models.md): models from Apple's registry to try first
