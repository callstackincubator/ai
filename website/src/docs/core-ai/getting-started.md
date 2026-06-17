# Getting Started

`@react-native-ai/core-ai` lets React Native apps run app-provided Apple Core AI model bundles. Use it when you export models from [`apple/coreai-models`](https://github.com/apple/coreai-models) and ship or download those bundles in your app.

Use `@react-native-ai/apple` for Apple system models. Use `@react-native-ai/core-ai` for custom Core AI model assets.

## Installation

```bash
npm install @react-native-ai/core-ai
```

If you use the AI SDK, install `ai` v6 and the required polyfills:

```bash
npm install ai
```

## Requirements

- React Native New Architecture
- iOS 27 or newer for Core AI runtime APIs
- Xcode 27 or newer for building apps with Core AI
- Exported `.aimodel` bundles from `apple/coreai-models`
- The Apple Core AI Models Swift Package linked to the host app target

## Swift Package Setup

Add `https://github.com/apple/coreai-models` to the iOS app as a Swift Package dependency, then link the products you use:

This is the intended integration path, but it still needs full verification in an Xcode 27 / iOS 27 host app with Apple Core AI products linked into the app target.

- `CoreAILM` for `coreAI.languageModel(...)` and sessions
- `CoreAIDiffusion` for `coreAI.imageModel(...)`
- `CoreAISegmentation` for `CoreAI.runTask('segmentation', ...)`
- `CoreAIObjectDetection` for `CoreAI.runTask('object-detection', ...)`

React Native installs this package through CocoaPods, but CocoaPods will not automatically link those Swift Package products into your app target. Treat SPM as a host-app integration step.

For Expo, use a config plugin that patches the generated Xcode project with `XCRemoteSwiftPackageReference` and links the selected products. For bare React Native, add the Swift Package in Xcode or use a project patching script that modifies `project.pbxproj` predictably.

The native module checks for missing products and returns clear setup errors instead of failing silently.

The current native implementation wires language sessions, diffusion image generation, image segmentation, and object detection. Embeddings, transcription, depth, super-resolution, and classification are listed as starter-model docs only; those task runners still need follow-up native wrappers.

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
