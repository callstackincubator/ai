# @react-native-ai/core-ai

Run your own models on iPhone with Apple's Core AI framework. Bring a model
bundle exported with [`apple/coreai-models`](https://github.com/apple/coreai-models),
such as Qwen3 or FLUX.2, and run it on-device from React Native. The package
comes with a [Vercel AI SDK](https://ai-sdk.dev) provider, so the same models
work with `generateText`, `streamText`, `generateImage`, `transcribe`, `embed`
and `experimental_generateVideo`.

> [!WARNING]
> Work in progress. This package is not published to npm yet.
> Its docs live in [`docs/`](./docs) until it is released.

Use it when you want to choose and ship the model yourself. For the models
built into iOS (Apple Intelligence, system speech and embeddings), use
[`@react-native-ai/apple`](../apple-llm) instead.

## Features

As a Vercel AI SDK provider:

- Text generation, streaming and tool calling with language models
- Image generation
- Video generation with `experimental_generateVideo`
- Transcription
- Text embeddings (CLIP)

As native APIs:

- Model loading, inspection and persistent language sessions
- Image and video segmentation, object detection, super-resolution,
  classification and depth estimation
- Raw `.aimodel` function calls with tensors

`specializeModel` returns metadata only. Reranking and speech generation are
not available, because `coreai-models` has no runtime for them yet.

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

| Task                 | Used by                                     | Linked product            |
| -------------------- | ------------------------------------------- | ------------------------- |
| `language`           | `coreAI.languageModel(...)` and sessions    | `CoreAILM`                |
| `diffusion`          | `coreAI.imageModel(...)`                    | `CoreAIDiffusion`         |
| `segmentation`       | `CoreAI.runTask('segmentation', ...)`       | `CoreAISegmentation`      |
| `object-detection`   | `CoreAI.runTask('object-detection', ...)`   | `CoreAIObjectDetection`   |
| `asr`                | `coreAI.transcriptionModel(...)`            | `CoreAISpeech`            |
| `video-segmentation` | `CoreAI.runTask('video-segmentation', ...)` | `CoreAIVideoSegmentation` |
| `video-diffusion`    | `coreAI.videoModel(...)`                    | `CoreAIVideoDiffusion`    |

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

### Memory Limit

iOS stops an app that uses more memory than its limit, which is about 3.4 GB on an iPhone 17 Pro. Larger models, such as the 3.1 GB text encoder of the Wan 2.1 video model, need the [increased memory limit](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.kernel.increased-memory-limit) entitlement, which raises it to about 6 GB. With Expo, the plugin adds it:

```json
{
  "expo": {
    "plugins": [["@react-native-ai/core-ai", { "increasedMemoryLimit": true }]]
  }
}
```

The App ID has to have the Increased Memory Limit capability, so sign with an explicit App ID (a wildcard profile cannot carry it). In a bare app, add the capability to the app target in Xcode.

Even with it, Wan 2.1 does not finish on an iPhone yet: its VAE decoder needs more GPU memory than the raised limit allows ([#306](https://github.com/callstackincubator/ai/issues/306)).

## Usage

```ts
import { coreAI } from '@react-native-ai/core-ai'
import { streamText } from 'ai'

const model = coreAI.languageModel({
  id: 'qwen3-0.6b',
  source: qwen3ModelDirectory,
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
import { CoreAI } from '@react-native-ai/core-ai'

await CoreAI.inspectModel(modelConfig)
```

## Loading Models

Core AI loads models from local `.aimodel` / `.aimodelc` files and model folders. `source` is a path or `file://` URL in app storage, or `bundle://` and a path in the app bundle for a model shipped with the app:

```ts
const downloaded = coreAI.languageModel({
  source: `${modelsDirectory}/qwen3-0.6b`,
})
const bundled = coreAI.languageModel({ source: 'bundle://models/qwen3-0.6b' })
```

`id` is optional. It names the model in AI SDK results and telemetry, and defaults to the folder or `.aimodel` name (`qwen3-0.6b` above). Built-in download, specialization and caching is tracked in [#235](https://github.com/callstackincubator/ai/issues/235).

## Documentation

- [Getting started](./docs/getting-started.md): installation, native setup and a first model
- [API surface](./docs/api.md): AI SDK adapters, native sessions and direct native calls
- [Starter models](./docs/models.md): models from Apple's registry to try first
