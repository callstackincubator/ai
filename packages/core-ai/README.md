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

Add `https://github.com/apple/coreai-models` as a Swift Package dependency in
the host iOS app and link the products used by your wrappers:

This is the intended integration path, but it still needs full verification in
an Xcode 27 / iOS 27 host app with Apple Core AI products linked into the app
target.

- `CoreAILM` for language models and sessions
- `CoreAIDiffusion` for image generation
- `CoreAISegmentation` for segmentation
- `CoreAIObjectDetection` for object detection

React Native installs this package through CocoaPods, but Apple's helpers are
Swift Package products. The app target still needs those SPM products linked.
For Expo, add the config plugin. It links all known Apple Core AI Swift Package
products by default:

```json
{
  "expo": {
    "plugins": ["@react-native-ai/core-ai"]
  }
}
```

Pass `products` only when you want to link a smaller set:

```json
{
  "expo": {
    "plugins": [
      ["@react-native-ai/core-ai", { "products": ["CoreAILM"] }]
    ]
  }
}
```

For bare React Native, add the Swift Package in Xcode or with a project patching
script.

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
