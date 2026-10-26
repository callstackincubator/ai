# API Surface

Core AI has two API layers.

## AI SDK Adapters

Use these when you want portable AI SDK app code:

```typescript
import { coreAI } from '@react-native-ai/core-ai'
import { generateText } from 'ai'

const language = coreAI.languageModel({
  id: 'qwen3-0.6b',
  source: { type: 'file', uri: qwen3ModelDirectory },
  variant: 'iOS',
})

await generateText({ model: language, prompt: 'Hello' })
```

AI SDK adapter status:

| Capability        | AI SDK API                                    | Core AI API                      | Status                        |
| ----------------- | --------------------------------------------- | -------------------------------- | ----------------------------- |
| Text generation   | `generateText`, `streamText`                  | `coreAI.languageModel(...)`      | Supported                     |
| Structured output | `generateText` / `streamText` response format | `coreAI.languageModel(...)`      | Supported, with a JSON schema |
| Tool calling      | `tools` option                                | `coreAI.languageModel(...)`      | Not supported yet (warns)     |
| Image generation  | `generateImage`                               | `coreAI.imageModel(...)`         | Supported                     |
| Text embeddings   | `embed`, `embedMany`                          | `coreAI.embeddingModel(...)`     | Throws unsupported error      |
| Transcription     | `transcribe`                                  | `coreAI.transcriptionModel(...)` | Supported, Parakeet TDT       |

Structured output needs a JSON schema and runs as guided generation, so the output always matches it. Models whose inference engine cannot do guided generation reject with a `CORE_AI_UNSUPPORTED_CAPABILITY` error. When streaming, the JSON arrives in one piece once it is complete.

The `reasoning` call option sets the model's thinking effort (`minimal`/`low` → `light`, `medium` → `moderate`, `high` and above → `deep`), and `reasoning: 'none'` turns thinking off. `providerOptions['core-ai'].reasoningLevel` (`'none' | 'light' | 'moderate' | 'deep'`) takes precedence. Reasoning comes back as reasoning parts. Core AI ignores `topP`, `topK`, `seed`, stop sequences and penalties, and returns a warning when they are set.

`coreAI.transcriptionModel(...)` runs `CoreAISpeech` bundles. Export Parakeet TDT with `--streaming` so the model transcribes audio of any length and returns segments with timestamps, closed at pauses. Other bundles transcribe only as much audio as their traced window holds (5 seconds by default) and return one segment. Audio can be any format AVFoundation decodes (WAV, MP3, M4A, FLAC, CAF, AIFF), picked by `mediaType`. The model stays loaded after the first call. Parakeet does not detect the language, so `language` is not set.

`coreAI.embeddingModel(...)` exists so the API is in place, but it throws until the package has native runners for CLIP models ([#237](https://github.com/callstackincubator/ai/issues/237)).

There are no adapters for reranking, speech generation, or video generation, because `coreai-models` has no models for them. Use `@react-native-ai/apple` for system speech synthesis.

## Direct Native APIs

Use direct APIs when Core AI has no AI SDK equivalent or when you need Core AI-specific lifecycle control:

```typescript
import { CoreAI, coreAI, toNativeModelConfig } from '@react-native-ai/core-ai'

const config = {
  id: 'qwen3-0.6b',
  source: { type: 'file', uri: qwen3ModelDirectory },
  variant: 'iOS',
} as const

await CoreAI.inspectModel(toNativeModelConfig({ ...config, task: 'language' }))

const model = coreAI.languageModel(config)

await model.prepare()

const session = await model.createSession({
  instructions: 'Keep answers short.',
})

await session.respond('Create a vocabulary card for "flower".')
```

Native-only API status:

| Capability           | API                                       | Status                                  | Why native-only                                                            |
| -------------------- | ----------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| Model inspection     | `CoreAI.inspectModel(...)`                | Supported                               | AI SDK does not manage Core AI asset metadata.                             |
| Specialization       | `CoreAI.specializeModel(...)`             | Returns metadata only, does not compile | Core AI-specific preparation step.                                         |
| Persistent sessions  | `model.createSession(...)`                | Supported for language models           | AI SDK owns message history; Core AI sessions own native transcript state. |
| Segmentation         | `CoreAI.runTask('segmentation', ...)`     | Supported                               | AI SDK image APIs do not model segmentation masks.                         |
| Object detection     | `CoreAI.runTask('object-detection', ...)` | Supported                               | AI SDK has no detection primitive.                                         |
| Depth estimation     | `CoreAI.runTask('depth', ...)`            | Throws unsupported error                | AI SDK has no depth primitive.                                             |
| Super-resolution     | `CoreAI.runTask('super-resolution', ...)` | Throws unsupported error                | AI SDK has no image-to-image upscaling primitive.                          |
| Raw `.aimodel` calls | `CoreAI.runRawFunction(...)`              | Supported                               | AI SDK has no tensor primitive.                                            |

### Raw Function Calls

Any exported `.aimodel` runs through its functions, for models that have no task wrapper. Load it with the `raw` task, which needs no `coreai-models` product, and call a function by name with tensors:

```ts
import { CoreAI, createTensor, readTensor } from '@react-native-ai/core-ai'

const { modelHandle, info } = await CoreAI.loadModel(
  { id: 'edsr-x2', source: { type: 'file', uri }, task: 'raw' },
  {}
)
// [{ name: 'main', inputs: [{ name: 'x', dataType: 'float16', shape: [-1, 3, -1, -1] }], outputs: [...] }]
console.log(info.functions)

const { outputs } = await CoreAI.runRawFunction(
  modelHandle,
  'main',
  { x: createTensor('float32', [1, 3, 64, 64], pixels) },
  {}
)
const upscaled = readTensor(outputs.output) // Float32Array of 1 × 3 × 128 × 128
```

`CoreAI.inspectModel(...)` also lists the functions of a `.aimodel` on disk. A shape of `-1` marks a dynamic dimension, which the input's `shape` sets.

Ownership and performance:

- Tensors cross the bridge as `{ dataType, shape, data }`, with `data` holding the little-endian elements in row-major order as base64. `createTensor` and `readTensor` convert typed arrays. Every call copies its inputs into new arrays and its outputs out, so JS never holds native memory and nothing outlives the call.
- Functions load their weights on their first call and stay loaded until `CoreAI.unloadModel(modelHandle)`.
- Core AI specializes the model for a compute unit when it loads. Pass `{ computeUnits: 'gpu' }` (or `'cpu'`, `'neural-engine'`) as the `loadModel` options to choose one, for example when the Neural Engine compiler rejects a model.
- Hermes has no `Float16Array`, so float16 and bfloat16 inputs can be given as float32, and their outputs come back as float32. Pass `{ outputDataType: 'native' }` to get the bits of each element instead (a `Uint16Array` from `readTensor`).
- Base64 adds a third to the size of each tensor, and every call encodes and decodes it on the JS thread. Use a task wrapper, or keep tensors to a few megabytes, for work that runs every frame.
- Image inputs (pixel buffers) are not supported yet.

When the AI SDK owns message history, every request sends the whole chat. To
keep it inside the context window, see
[Conversation History](https://react-native-ai.dev/docs/history).

## Loading Models

Core AI loads models from local `.aimodel` / `.aimodelc` files, so download them into app storage yourself and pass a local `source: { type: 'file', uri }`. Built-in download, specialization and caching is tracked in [#235](https://github.com/callstackincubator/ai/issues/235).

## Starter Models

The package does not ship a model catalog. The [starter models](./models.md) page is a reference list of models known to work; your app decides which models to bundle or download.
