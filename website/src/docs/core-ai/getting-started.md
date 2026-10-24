# Getting Started

`coreAI` from `@react-native-ai/apple` lets React Native apps run app-provided Apple Core AI model bundles. Use it when you export models from [`apple/coreai-models`](https://github.com/apple/coreai-models) and ship or download those bundles in your app.

Use `apple(...)` for Apple system models and `coreAI` for custom Core AI model assets. Both ship in `@react-native-ai/apple`, and Core AI is opt-in at `pod install` time.

## Installation

```bash
npm install @react-native-ai/apple
```

If you use the AI SDK, install `ai` v7 and the required polyfills:

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

Core AI is opt-in, so apps that only use Apple Intelligence keep their deployment target and simulator builds. Set `APPLE_CORE_AI=1` when installing pods (with Expo, when running prebuild) and the `AppleLLM` pod links Apple's [`coreai-models`](https://github.com/apple/coreai-models) Swift Package (1.0.0 up to the next major version) to itself, so there is no Xcode or config plugin step:

```bash
APPLE_CORE_AI=1 npx pod-install
APPLE_CORE_AI=1 npx expo prebuild -p ios
```

`APPLE_CORE_AI=1` links every product the native module uses:

- `CoreAILM` for `coreAI.languageModel(...)` and sessions
- `CoreAIDiffusion` for `coreAI.imageModel(...)`
- `CoreAISegmentation` for `CoreAI.runTask('segmentation', ...)`
- `CoreAIObjectDetection` for `CoreAI.runTask('object-detection', ...)`

To link a smaller set, set `CORE_AI_PRODUCTS` instead (it also opts in):

```bash
CORE_AI_PRODUCTS=CoreAILM npx pod-install
CORE_AI_PRODUCTS=CoreAILM npx expo prebuild -p ios
```

Features whose product is not linked return a clear setup error at runtime.

Constraints from Apple's package, once Core AI is linked:

- The app needs an **iOS 27 deployment target** (with Expo, set `ios.deploymentTarget` to `27.0` in `expo-build-properties`).
- **Device builds only.** The iOS Simulator SDK does not include the `CoreAI` framework, so apps that link Core AI cannot be built for the simulator. Install pods without `APPLE_CORE_AI` for simulator builds.

The current native implementation wires language sessions, diffusion image generation, image segmentation, and object detection. Starter-model docs only list those exposed feature families; embeddings, transcription, depth, super-resolution, and classification are tracked in [#237](https://github.com/callstackincubator/ai/issues/237).

## First iOS Model

Start with Qwen3 0.6B because Apple’s registry includes an iOS preset:

```bash
uv run coreai.llm.export Qwen/Qwen3-0.6B --platform iOS --output-dir ./models
```

Then load it from React Native:

```typescript
import { coreAI } from '@react-native-ai/apple'
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
