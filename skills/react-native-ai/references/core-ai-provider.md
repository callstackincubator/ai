# Core AI Provider

## Quick Command

```bash
npm add @react-native-ai/apple
APPLE_CORE_AI=1 npx pod-install
```

```ts
import { coreAI } from '@react-native-ai/apple'
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
- [ ] A physical device. The iOS Simulator SDK has no `CoreAI` framework, so apps that link Core AI do not build for the simulator
- [ ] Vercel AI SDK v7+ (`ai`) if using `generateText` / `streamText` / `generateImage`
- [ ] Model bundles exported from `apple/coreai-models`

## Step-by-Step Instructions

### 1. Install

```bash
npm add @react-native-ai/apple
```

Core AI ships in `@react-native-ai/apple` and is opt-in. There is no config plugin. Set `APPLE_CORE_AI=1` when installing pods (with Expo, when running prebuild), and the `AppleLLM` pod links the `coreai-models` Swift package:

```bash
APPLE_CORE_AI=1 npx pod-install
APPLE_CORE_AI=1 npx expo prebuild -p ios
```

Without it, Apple Intelligence works as before (including simulator builds) and Core AI calls return a setup error.

### 2. Choose Linked Products (optional)

`APPLE_CORE_AI=1` links `CoreAILM`, `CoreAIDiffusion`, `CoreAISegmentation` and `CoreAIObjectDetection`. To link fewer, set `CORE_AI_PRODUCTS` instead (it also opts in):

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

- **Simulator builds fail**: Core AI is device-only. Install pods without `APPLE_CORE_AI` / `CORE_AI_PRODUCTS` for simulator builds, or test on a device.
- **Unsupported adapters**: `coreAI.embeddingModel(...)` and `coreAI.transcriptionModel(...)` exist but reject with an unsupported error. Depth, super-resolution and raw `.aimodel` calls also reject.
- **Structured output**: needs a JSON schema (guided generation), and models whose engine cannot do guided generation reject with `CORE_AI_UNSUPPORTED_CAPABILITY`. Streamed JSON arrives once complete.
- **Tools**: not supported by the language model yet. Tools are not passed to the model and the call returns a warning.
- **Wrong model**: Apple Intelligence (Foundation Models system model) is `apple(...)`; Core AI bundles are `coreAI.languageModel(...)`. Both come from `@react-native-ai/apple`.

## Related Skills

- [quick-start](quick-start.md)
- [apple-provider](apple-provider.md)
