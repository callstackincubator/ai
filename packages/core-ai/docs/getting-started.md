# Getting Started

`@react-native-ai/core-ai` lets React Native apps run app-provided Apple Core AI model bundles. Use it when you export models from [`apple/coreai-models`](https://github.com/apple/coreai-models) and ship or download those bundles in your app.

Use `@react-native-ai/apple` for Apple system models. Use `@react-native-ai/core-ai` for custom Core AI model assets.

## Installation

```bash
npm install @react-native-ai/core-ai @react-native-ai/apple
```

To use it with the AI SDK, install `ai` v7 and the [required polyfills](https://react-native-ai.dev/docs/polyfills):

```bash
npm install ai
```

## Requirements

- React Native New Architecture
- iOS 27 deployment target (with Expo, the config plugin sets it)
- Xcode 27 or newer for building apps with Core AI
- Exported `.aimodel` bundles from `apple/coreai-models`
- A physical device. The iOS Simulator SDK has no `CoreAI` framework, so apps that install this package cannot be built for the simulator

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

| `video-segmentation` | `CoreAI.runTask('video-segmentation', ...)` | `CoreAIVideoSegmentation` |

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

Supported today: text generation, image generation, segmentation, object detection, super-resolution, classification, depth estimation, and text and image embeddings. Transcription is tracked in [#237](https://github.com/callstackincubator/ai/issues/237).

## First iOS Model

Start with Qwen3 0.6B because Apple’s registry includes an iOS preset:

```bash
uv run coreai.llm.export Qwen/Qwen3-0.6B --platform iOS --output-dir ./models
```

Then load it from React Native:

```typescript
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

for await (const delta of result.textStream) {
  console.log(delta)
}
```

For a persistent native session:

```typescript
await model.prepare()

const session = await model.createSession({
  instructions: 'Answer in one short paragraph.',
})

const response = await session.respond('What is on-device AI?')

await session.close()
await model.unload()
```
