# @react-native-ai/core-ai

Apple Core AI provider for React Native AI.

This package is for app-provided Core AI model bundles exported from
[`apple/coreai-models`](https://github.com/apple/coreai-models). It is separate
from `@react-native-ai/apple`, which wraps Apple system capabilities such as
Foundation Models, NLContextualEmbedding, SpeechAnalyzer, and AVSpeechSynthesizer.

## API Layers

Core AI exposes two layers:

- AI SDK adapters where AI SDK has a matching model interface: language models,
  image generation, text embeddings, and transcription.
- Direct native APIs for Core AI-specific capabilities: model loading,
  persistent language sessions, model inspection, specialization, segmentation,
  object detection, depth, super-resolution, and raw `.aimodel` functions.

The first native wrappers cover language sessions, diffusion image generation,
segmentation, and object detection. Embeddings, transcription, depth,
super-resolution, classification, reranking, speech generation, video
generation, and arbitrary raw tensor calls stay explicit: embeddings and
transcription keep AI SDK-shaped adapters because Apple has starter export
recipes, while reranking, speech, and video have no provider helpers until a
real Core AI model/runtime exists.

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

Features whose product is not linked return a clear setup error at runtime.

Constraints from Apple's package:

- The app needs an **iOS 27 deployment target** (with Expo, set `ios.deploymentTarget` to `27.0` in `expo-build-properties`).
- **Device builds only.** The iOS Simulator SDK does not include the `CoreAI` framework, so apps that install this package cannot be built for the simulator.

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

## Model Management TBD

Remote Core AI assets still need a first-class download path. Apple’s native
API loads and specializes local `.aimodel` or `.aimodelc` URLs, so this package
should add helpers that download model bundles into app storage, return a local
file source, optionally specialize the model before first use, and persist
bookmark data for cached specialized assets. Where possible, the downloader and
storage pieces should be shared with the other React Native AI runtimes instead
of duplicating provider-specific plumbing.
