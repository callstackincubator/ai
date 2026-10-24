# Core AI Provider

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
- DO NOT use for Apple Intelligence system models. Use [apple-provider](apple-provider.md) instead

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

By default the pod links native support for every task: `language` (`CoreAILM`), `diffusion` (`CoreAIDiffusion`), `segmentation` (`CoreAISegmentation`) and `object-detection` (`CoreAIObjectDetection`). To link fewer with Expo, pass `tasks` to the config plugin:

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
- Segmentation and object detection: `CoreAI.runTask('segmentation' | 'object-detection', ...)`
- Model metadata: `CoreAI.inspectModel(...)`

## Common Pitfalls

- **Simulator builds fail**: Core AI is device-only. Exclude the package from simulator builds or test on a device.
- **Unsupported adapters**: `coreAI.embeddingModel(...)` and `coreAI.transcriptionModel(...)` exist but reject with an unsupported error. Depth, super-resolution and raw `.aimodel` calls also reject.
- **Structured output**: needs a JSON schema and runs as guided generation. Models whose engine cannot do guided generation reject with `CORE_AI_UNSUPPORTED_CAPABILITY`. Streamed JSON arrives in one piece once it is complete.
- **Tools**: not supported yet. Tools are not passed to the model, and the call returns a warning.
- **Wrong package**: Apple Intelligence (Foundation Models system model) is `@react-native-ai/apple`, not Core AI.

## Related Skills

- [quick-start](quick-start.md)
- [apple-provider](apple-provider.md)
