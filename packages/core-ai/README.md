# @react-native-ai/core-ai

Apple Core AI provider for React Native AI.

This package is for app-provided Core AI model bundles exported from
[`apple/coreai-models`](https://github.com/apple/coreai-models). It is separate
from `@react-native-ai/apple`, which wraps Apple system capabilities such as
Foundation Models, NLContextualEmbedding, SpeechAnalyzer, and AVSpeechSynthesizer.

## API Layers

Core AI exposes two layers:

- AI SDK adapters: language models and image generation. Text embedding and
  transcription adapters exist, because Apple has starter export recipes for
  them, but they reject with an unsupported error until native runners land
  ([#237](https://github.com/callstackincubator/ai/issues/237)).
- Direct native APIs: model loading, persistent language sessions, model
  inspection, segmentation, and object detection. `specializeModel` returns
  metadata only. Depth, super-resolution, and raw `.aimodel` function calls
  reject with an unsupported error.

Reranking, speech generation, and video generation have no adapters, because
`coreai-models` has no runtime for them yet.

## Native Setup

The pod links Apple's [`coreai-models`](https://github.com/apple/coreai-models)
Swift Package (1.0.0 up to the next major version) to itself during `pod install`, so there is no Xcode or config plugin step. By default it links every product the native module uses:

- `CoreAILM` for `coreAI.languageModel(...)` and sessions
- `CoreAIDiffusion` for `coreAI.imageModel(...)`
- `CoreAISegmentation` for `CoreAI.runTask('segmentation', ...)`
- `CoreAIObjectDetection` for `CoreAI.runTask('object-detection', ...)`

To link a smaller set, set `CORE_AI_PRODUCTS` when installing pods (with Expo, when running prebuild):

```bash
CORE_AI_PRODUCTS=CoreAILM npx pod-install
CORE_AI_PRODUCTS=CoreAILM npx expo prebuild -p ios
```

Calling a feature whose product is not linked throws a setup error.

> [!IMPORTANT]
> Apps need an iOS 27 deployment target (with Expo, set `ios.deploymentTarget` to `27.0` in `expo-build-properties`) and build for physical devices only, since the iOS Simulator SDK has no `CoreAI` framework.

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
