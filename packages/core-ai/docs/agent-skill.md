# Core AI Provider

<!-- Agent skill reference. Kept here, unlinked, while the package is unreleased.
On release, move it back to skills/react-native-ai/references/core-ai-provider.md
and add the Core AI route to skills/react-native-ai/SKILL.md and quick-start.md. -->

## Quick Command

```bash
npm add @react-native-ai/core-ai @react-native-ai/apple
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
- DO NOT use for Apple Intelligence system models. Use [apple-provider](../../../skills/react-native-ai/references/apple-provider.md) instead

## Prerequisites

- [ ] React Native New Architecture
- [ ] iOS 27 deployment target (with Expo, the `@react-native-ai/core-ai` config plugin sets it)
- [ ] Xcode 27 or newer
- [ ] A physical device. The iOS Simulator SDK has no `CoreAI` framework, so apps with this package do not build for the simulator
- [ ] Vercel AI SDK v7+ (`ai`) if using `generateText` / `streamText` / `generateImage`
- [ ] Model bundles exported from `apple/coreai-models`

## Step-by-Step Instructions

### 1. Install

```bash
npm add @react-native-ai/core-ai @react-native-ai/apple
```

`@react-native-ai/apple` is a peer dependency: the pod reuses its Foundation Models helpers for language models. The pod links the `coreai-models` Swift package during `pod install`.

With Expo, add the config plugin. It sets the iOS 27 deployment target:

```json
{ "expo": { "plugins": ["@react-native-ai/core-ai"] } }
```

In a bare app, set `platform :ios, '27.0'` in the `Podfile` and the Xcode project's deployment target.

### 2. Choose Linked Tasks (optional)

By default the pod links native support for every task: `language` (`CoreAILM`), `diffusion` (`CoreAIDiffusion`), `segmentation` (`CoreAISegmentation`), `object-detection` (`CoreAIObjectDetection`), `asr` (`CoreAISpeech`), `video-segmentation` (`CoreAIVideoSegmentation`) and `video-diffusion` (`CoreAIVideoDiffusion`). To link fewer with Expo, pass `tasks` to the config plugin:

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

### 3. Export and Ship a Model

```bash
uv run coreai.llm.export Qwen/Qwen3-0.6B --platform iOS --output-dir ./models
```

Download or bundle the exported directory into app storage, and pass it as `source: { type: 'file', uri }`. There is no built-in downloader yet.

### 4. Use It

- Language: `coreAI.languageModel(config)` with `generateText` / `streamText`. Supports message history, structured output with a schema, and the `reasoning` option (`providerOptions['core-ai'].reasoningLevel` wins)
- Persistent native sessions: `await model.createSession()`, then `session.respond(...)`
- Image generation: `coreAI.imageModel(config)` with `generateImage`
- Video generation: `coreAI.videoModel(config)` with `experimental_generateVideo`, on a Wan 2.1 bundle (links `CoreAIVideoDiffusion`)
- Transcription: `coreAI.transcriptionModel(config)` with `transcribe`, on a Parakeet TDT bundle
- Text embeddings: `coreAI.embeddingModel(config)` with `embed` / `embedMany`, on a CLIP export folder (`.aimodel` + `tokenizer/`). Images: `model.embedImages(imageUris)`
- Segmentation and object detection: `CoreAI.runTask('segmentation' | 'object-detection', ...)`
- Super-resolution, classification and depth: `CoreAI.runTask('super-resolution' | 'classification' | 'depth', config, { imageUri }, options)`, on EDSR, PVT and Depth Anything exports
- Video segmentation and tracking: `CoreAI.runTask('video-segmentation', config, { videoUri, data: { prompts } }, options)` on a SAM 3 video bundle (links `CoreAIVideoSegmentation`)
- Any other `.aimodel`: `CoreAI.loadModel({ ...config, task: 'raw' }, {})`, then `CoreAI.runRawFunction(modelHandle, functionName, inputs, {})` with tensors from `createTensor`, read back with `readTensor`
- Model metadata and function signatures: `CoreAI.inspectModel(...)`

## Common Pitfalls

- **Simulator builds fail**: Core AI is device-only. Exclude the package from simulator builds or test on a device.
- **Structured output**: needs a JSON schema and runs as guided generation. Models whose engine cannot do guided generation reject with `CORE_AI_UNSUPPORTED_CAPABILITY`. Streamed JSON arrives in one piece once it is complete.
- **Tools**: not supported yet. Tools are not passed to the model, and the call returns a warning.
- **Wrong package**: Apple Intelligence (Foundation Models system model) is `@react-native-ai/apple`, not Core AI.

## Related Skills

- [quick-start](../../../skills/react-native-ai/references/quick-start.md)
- [apple-provider](../../../skills/react-native-ai/references/apple-provider.md)
