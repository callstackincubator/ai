# Core AI Provider

## Quick Command

```bash
npm add @react-native-ai/core-ai
```

```ts
import { coreAI } from '@react-native-ai/core-ai'
import { generateText } from 'ai'

const model = coreAI.languageModel({
  id: 'qwen3-0.6b',
  source: { type: 'file', uri: qwen3ModelDirectory },
  variant: 'iOS',
})
await model.prepare()
const { text } = await generateText({ model, prompt: 'Hello' })
```

## When to Use

- Run your own Apple Core AI model bundles (`.aimodel` / `.aimodelc`) exported from [`apple/coreai-models`](https://github.com/apple/coreai-models)
- Need image generation (FLUX.2 / Sana Sprint), segmentation, or object detection with Core AI
- DO NOT use for Apple Intelligence system models. Use [apple-provider](apple-provider.md) instead

## Prerequisites

- [ ] React Native New Architecture
- [ ] iOS 27 deployment target (with Expo, `ios.deploymentTarget: '27.0'` in `expo-build-properties`)
- [ ] Xcode 27 or newer
- [ ] A physical device. The iOS Simulator SDK has no `CoreAI` framework, so apps with this package do not build for the simulator
- [ ] Vercel AI SDK v7+ (`ai`) if using `generateText` / `streamText` / `generateImage`
- [ ] Model bundles exported from `apple/coreai-models`

## Step-by-Step Instructions

### 1. Install

```bash
npm add @react-native-ai/core-ai
```

There is no config plugin. The pod links the `coreai-models` Swift package during `pod install`.

### 2. Choose Linked Products (optional)

By default the pod links `CoreAILM`, `CoreAIDiffusion`, `CoreAISegmentation` and `CoreAIObjectDetection`. To link fewer, set `CORE_AI_PRODUCTS`:

```bash
CORE_AI_PRODUCTS=CoreAILM npx pod-install
CORE_AI_PRODUCTS=CoreAILM npx expo prebuild -p ios
```

Features whose product is not linked return a setup error at runtime.

### 3. Export and Ship a Model

```bash
uv run coreai.llm.export Qwen/Qwen3-0.6B --platform iOS --output-dir ./models
```

Download or bundle the exported directory into app storage, and pass it as `source: { type: 'file', uri }`. There is no built-in downloader yet.

### 4. Use It

- Language: `coreAI.languageModel(config)` with `generateText` / `streamText`
- Persistent native sessions: `await model.createSession()`, then `session.respond(...)`
- Image generation: `coreAI.imageModel(config)` with `generateImage`
- Segmentation and object detection: `CoreAI.runTask('segmentation' | 'object-detection', ...)`
- Model metadata: `CoreAI.inspectModel(...)`

## Common Pitfalls

- **Simulator builds fail**: Core AI is device-only. Exclude the package from simulator builds or test on a device.
- **Unsupported adapters**: `coreAI.embeddingModel(...)` and `coreAI.transcriptionModel(...)` exist but reject with an unsupported error. Depth, super-resolution and raw `.aimodel` calls also reject.
- **Structured output and tools**: not supported by the language model yet.
- **Wrong package**: Apple Intelligence (Foundation Models system model) is `@react-native-ai/apple`, not Core AI.

## Related Skills

- [quick-start](quick-start.md)
- [apple-provider](apple-provider.md)
