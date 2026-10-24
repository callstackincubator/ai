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
- iOS 27 or newer, with an iOS 27 deployment target
- Xcode 27 or newer for building apps with Core AI
- Exported `.aimodel` bundles from `apple/coreai-models`
- A physical device (the iOS Simulator SDK has no `CoreAI` framework)

## Native Setup

The pod links Apple's [`coreai-models`](https://github.com/apple/coreai-models) Swift Package (1.0.0 up to the next major version) to itself during `pod install`, so there is no Xcode or config plugin step. By default it links every product the native module uses:

- `CoreAILM` for `coreAI.languageModel(...)` and sessions
- `CoreAIDiffusion` for `coreAI.imageModel(...)`
- `CoreAISegmentation` for `CoreAI.runTask('segmentation', ...)`
- `CoreAIObjectDetection` for `CoreAI.runTask('object-detection', ...)`

To link a smaller set, set `CORE_AI_PRODUCTS` when installing pods (with Expo, when running prebuild):

```bash
CORE_AI_PRODUCTS=CoreAILM npx pod-install
CORE_AI_PRODUCTS=CoreAILM npx expo prebuild -p ios
```

Features whose product is not linked return a clear setup error at runtime.

Constraints from Apple's package:

- The app needs an **iOS 27 deployment target** (with Expo, set `ios.deploymentTarget` to `27.0` in `expo-build-properties`).
- **Device builds only.** The iOS Simulator SDK does not include the `CoreAI` framework, so apps that install this package cannot be built for the simulator.

The current native implementation wires language sessions, diffusion image generation, image segmentation, and object detection. Starter-model docs only list those exposed feature families; embeddings, transcription, depth, super-resolution, and classification still need follow-up native wrappers.

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
