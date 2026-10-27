# Core AI Provider

## Quick Command

```bash
npm add @react-native-ai/core-ai @react-native-ai/apple ai
```

```ts
import { coreAI } from '@react-native-ai/core-ai'
import { generateText } from 'ai'

const model = coreAI.languageModel({
  id: 'qwen3-0.6b',
  source: qwen3ModelDirectory,
})
const { text } = await generateText({ model, prompt: 'Hello' })
```

## When to Use

- Run Apple Core AI model bundles (`.aimodel` / `.aimodelc`) exported with [`apple/coreai-models`](https://github.com/apple/coreai-models) on iOS 27
- Need text, image or video generation, transcription, CLIP embeddings, object detection, segmentation, video tracking, super-resolution, classification or depth estimation with your own models
- Need to run any `.aimodel` with tensors
- DO NOT use for Apple Intelligence system models. Use [apple-provider](apple-provider.md) instead

## Prerequisites

- [ ] React Native New Architecture
- [ ] iOS 27 deployment target (with Expo, the `@react-native-ai/core-ai` config plugin sets it)
- [ ] Xcode 27 or newer
- [ ] A physical device. The iOS Simulator SDK has no `CoreAI` framework, so apps with this package do not build for the simulator
- [ ] Vercel AI SDK v7+ (`ai`) for the AI SDK functions
- [ ] A model: start from the [hosted exports](https://react-native-ai.dev/docs/core-ai/models), or export one with `apple/coreai-models`

## Step-by-Step Instructions

### 1. Install

```bash
npm add @react-native-ai/core-ai @react-native-ai/apple ai
```

`@react-native-ai/apple` is a peer dependency: language models run through its Foundation Models session. The pod links the `coreai-models` Swift package during `pod install`.

With Expo, add the config plugin, then run `npx expo prebuild` so it applies, also after changing its options. It sets the iOS 27 deployment target:

```json
{ "expo": { "plugins": ["@react-native-ai/core-ai"] } }
```

In a bare app, set `platform :ios, '27.0'` in the `Podfile` and the Xcode project's deployment target, then run `npx pod-install`.

`generateText` and `streamText` need the [AI SDK polyfills](https://react-native-ai.dev/docs/polyfills) (`ReadableStream`, `TextEncoderStream` and others) when the app does not load them already.

### 2. Choose Linked Tasks (optional)

The pod links every task by default: `language` (`CoreAILM`), `diffusion` (`CoreAIDiffusion`), `video-diffusion` (`CoreAIVideoDiffusion`), `asr` (`CoreAISpeech`), `segmentation` (`CoreAISegmentation`), `video-segmentation` (`CoreAIVideoSegmentation`) and `object-detection` (`CoreAIObjectDetection`). Embeddings, super-resolution, classification, depth and raw calls need no product. To link fewer with Expo, pass `tasks` to the config plugin:

```json
{
  "expo": {
    "plugins": [["@react-native-ai/core-ai", { "tasks": ["language"] }]]
  }
}
```

In a bare app, set `CORE_AI_TASKS` on every `pod install`:

```bash
CORE_AI_TASKS=language npx pod-install
```

Calls for a task that isn't linked reject with `CORE_AI_MISSING_SPM_PRODUCT`.

### 3. Get a Model

Download a hosted export folder from Hugging Face into app storage (the [models page](https://react-native-ai.dev/docs/core-ai/models) lists one per task), or export one. The exporter isn't an npm package: it runs from an [`apple/coreai-models`](https://github.com/apple/coreai-models/blob/main/models/README.md) checkout, set up with `uv`:

```bash
# from an apple/coreai-models checkout
uv run coreai.llm.export qwen3-0.6b --platform iOS
```

Pass the folder's path as `source`, or `bundle://` and its path in the app bundle for a model shipped with the app. `id` is optional and defaults to the folder name.

### 4. Use It

- Language: `coreAI.languageModel(config)` with `generateText` / `streamText`. Message history, structured output with a schema, and the `reasoning` option (`providerOptions['core-ai'].reasoningLevel` wins)
- Persistent native sessions: `await model.createSession()`, then `session.respond(...)`
- Image generation: `coreAI.imageModel(config)` with `generateImage` (FLUX.2)
- Video generation: `coreAI.videoModel(config)` with `experimental_generateVideo` (Wan 2.1). The hosted export runs on macOS: on an iPhone 17 Pro the app is killed while the VAE decoder loads, even with the increased memory limit entitlement, so don't recommend it for iPhone yet
- Transcription: `coreAI.transcriptionModel(config)` with `transcribe`, and live 16-bit PCM with `experimental_streamTranscribe` (Parakeet TDT)
- Embeddings: `coreAI.embeddingModel(config)` with `embed` / `embedMany`, and `model.embedImages(imageUris)` (CLIP)
- Vision: `CoreAI.runTask('object-detection' | 'segmentation' | 'video-segmentation' | 'super-resolution' | 'classification' | 'depth', config, input, options)`. `CoreAI.*` native calls take the same config as the providers (`{ id?, source }`)
- Any `.aimodel`: `CoreAI.loadModel({ ...config, task: 'raw' }, {})`, then `CoreAI.runRawFunction(modelHandle, functionName, inputs, {})` with tensors from `createTensor`, read back with `readTensor`
- Function signatures: `CoreAI.inspectModel(...)`

## Common Pitfalls

- **Simulator builds fail**: Core AI is device-only. Exclude the package from simulator builds or test on a device.
- **Structured output**: needs a JSON schema and runs as guided generation. Models whose engine cannot do guided generation reject with `CORE_AI_UNSUPPORTED_CAPABILITY`. Streamed JSON arrives in one piece once it is complete.
- **Export shapes**: iOS exports are traced for fixed sizes. Image models warn about other sizes, and video models reject them.
- **Wrong package**: Apple Intelligence (Foundation Models system model) is `@react-native-ai/apple`, not Core AI.

## Related Skills

- [quick-start](quick-start.md)
- [apple-provider](apple-provider.md)
