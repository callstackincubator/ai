# API Surface

Core AI has two API layers.

## AI SDK Adapters

Use these when you want portable AI SDK app code:

```typescript
import { coreAI } from '@react-native-ai/core-ai'
import { generateText } from 'ai'

const language = coreAI.languageModel({
  id: 'qwen3-0.6b',
  source: qwen3ModelDirectory,
})

await generateText({ model: language, prompt: 'Hello' })
```

AI SDK adapter status:

| Capability        | AI SDK API                                    | Core AI API                      | Status                        |
| ----------------- | --------------------------------------------- | -------------------------------- | ----------------------------- |
| Text generation   | `generateText`, `streamText`                  | `coreAI.languageModel(...)`      | Supported                     |
| Structured output | `generateText` / `streamText` response format | `coreAI.languageModel(...)`      | Supported, with a JSON schema |
| Tool calling      | `tools` option                                | `coreAI.languageModel(...)`      | Supported, function tools     |
| Image generation  | `generateImage`                               | `coreAI.imageModel(...)`         | Supported                     |
| Video generation  | `experimental_generateVideo`                  | `coreAI.videoModel(...)`         | Supported, text-to-video      |
| Text embeddings   | `embed`, `embedMany`                          | `coreAI.embeddingModel(...)`     | Supported, CLIP               |
| Transcription     | `transcribe`                                  | `coreAI.transcriptionModel(...)` | Supported, Parakeet TDT       |

Structured output needs a JSON schema and runs as guided generation, so the output always matches it. Models whose inference engine cannot do guided generation reject with a `CORE_AI_UNSUPPORTED_CAPABILITY` error. When streaming, the JSON arrives in one piece once it is complete.

Tool calls end the generation and come back as `tool-call` parts, so the AI SDK runs the tools and replays their results on the next call. Set `stopWhen` (for example `stepCountIs(3)`) to let the model answer the results. Core AI models decide themselves whether to call a tool, so a `required` or named `toolChoice` warns and is treated as optional (a named tool is the only one offered). Provider-defined tools are left out with a warning.

```tsx
import { generateText, stepCountIs, tool } from 'ai'
import { z } from 'zod'

const { text } = await generateText({
  model: language,
  prompt: 'What is the weather in Paris?',
  tools: {
    getWeather: tool({
      description: 'Gets the weather in a city',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, temperature: 21 }),
    }),
  },
  stopWhen: stepCountIs(3),
})
```

The `reasoning` call option sets the model's thinking effort (`minimal`/`low` → `light`, `medium` → `moderate`, `high` and above → `deep`), and `reasoning: 'none'` turns thinking off. `providerOptions['core-ai'].reasoningLevel` (`'none' | 'light' | 'moderate' | 'deep'`) takes precedence. Reasoning comes back as reasoning parts. Core AI ignores `topP`, `topK`, `seed`, stop sequences and penalties, and returns a warning when they are set.

`coreAI.transcriptionModel(...)` runs `CoreAISpeech` bundles. Export Parakeet TDT with `--streaming` so the model transcribes audio of any length and returns segments with timestamps, closed at pauses. Other bundles transcribe only as much audio as their traced window holds (5 seconds by default) and return one segment. Audio can be any format AVFoundation decodes (WAV, MP3, M4A, FLAC, CAF, AIFF), picked by `mediaType`. The model stays loaded after the first call. Parakeet does not detect the language, so `language` is not set.

`coreAI.embeddingModel(...)` runs CLIP-style exports: an `.aimodel` with an `encode_text(input_ids, attention_mask)` function, next to a `tokenizer/` folder with the CLIP `tokenizer.json`. Point `source` at the folder holding both, like the [CLIP ViT-B/32 export](https://huggingface.co/grabbou/clip-vit-base-patch32-CoreAI). Values are tokenized to 77 tokens and embedded 16 at a time (`providerOptions['core-ai'].batchSize`). The AI SDK has no image embeddings, so `model.embedImages(imageUris)` embeds images into the same space with the `encode_image` function, which resizes the shorter side, crops the center and normalizes with the CLIP mean and std:

```ts
const model = coreAI.embeddingModel({ id: 'clip', source: folder })

const { embeddings } = await embedMany({ model, values: ['a photo of a cat', 'a photo of a car'] })
const { embeddings: [image] } = await model.embedImages([imageUri])
cosineSimilarity(embeddings[0], image) // higher for the matching caption
```

Embeddings need no `coreai-models` product of their own: the CLIP tokenizer comes with every product.

`coreAI.videoModel(...)` runs `coreai-models` video diffusion bundles (Wan 2.1) with `experimental_generateVideo`, and returns an MP4:

```ts
import { experimental_generateVideo as generateVideo } from 'ai'

const { video, providerMetadata } = await generateVideo({
  model: coreAI.videoModel({ id: 'wan2.1', source: folder }),
  prompt: 'a red ball rolling across a wooden table',
  providerOptions: { 'core-ai': { stepCount: 12 } },
})
// video.uint8Array: the MP4. providerMetadata['core-ai'].uri: the same file in the temporary directory
```

- iOS exports are traced for one size and length: the [hosted Wan 2.1 export](https://huggingface.co/grabbou/Wan2.1-T2V-1.3B-CoreAI) makes 832x480 videos of 81 frames (5 seconds at 16 fps), and the model rejects any other size or length. Exports with dynamic shapes (macOS) take other sizes.
- On those, `resolution` sets the size (multiples of 16), or `aspectRatio` picks one of Wan's: `16:9` (832x480), `9:16` and `1:1` (480x480). `duration` is rounded to 4n + 1 frames at `fps` (16), up to 81 frames, and `providerOptions['core-ai'].frameCount` sets the frames directly.
- `providerOptions['core-ai']` also takes `stepCount` (50), `guidanceScale` (5), `negativePrompt`, `cfgCutoff`, `vaeTileSize` and `lazyModelLoading`.
- Generation takes minutes on device. The abort signal stops it after the current denoising step.
- Image-to-video, reference inputs and audio are not supported, and return a warning.

There are no adapters for reranking or speech generation, because `coreai-models` has no models for them. Use `@react-native-ai/apple` for system speech synthesis.

## Direct Native APIs

Use direct APIs when Core AI has no AI SDK equivalent or when you need Core AI-specific lifecycle control:

```typescript
import { CoreAI, coreAI } from '@react-native-ai/core-ai'

const config = {
  id: 'qwen3-0.6b',
  source: qwen3ModelDirectory,
} as const

await CoreAI.inspectModel({ ...config, task: 'language' })

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
| Video segmentation   | `CoreAI.runTask('video-segmentation', ...)` | Supported                             | AI SDK has no video segmentation or tracking primitive.                    |
| Depth estimation     | `CoreAI.runTask('depth', ...)`            | Supported                               | AI SDK has no depth primitive.                                             |
| Super-resolution     | `CoreAI.runTask('super-resolution', ...)` | Supported                               | AI SDK has no image-to-image upscaling primitive.                          |
| Classification       | `CoreAI.runTask('classification', ...)`   | Supported                               | AI SDK has no image classification primitive.                              |
| Raw `.aimodel` calls | `CoreAI.runRawFunction(...)`              | Supported                               | AI SDK has no tensor primitive.                                            |

### Super-resolution, Classification and Depth

`coreai-models` has export recipes for these tasks but no Swift runtime, so the package runs the `main` function of the exported `.aimodel` itself. They need no `coreai-models` product, and any export with the same input works:

| Task               | Model input                                                              | Starter model                                                                                  | Output                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `super-resolution` | `[batch, 3, height, width]` RGB in 0...1                                 | [EDSR x2](https://huggingface.co/grabbou/edsr-x2-CoreAI)                                       | `image` (base64 PNG), `width`, `height`, `scale`. Images larger than `tileSize` (256 px) are upscaled in tiles that overlap by `tileOverlap` (16 px)              |
| `classification`   | `[1, 3, height, width]` normalized RGB, returns logits                   | [PVT v2 b0](https://huggingface.co/grabbou/pvt-v2-b0-CoreAI) (ImageNet-1k, with `labels.json`) | `classifications`: the `topK` (5) classes with `index`, `label` and softmax `confidence`                                                                          |
| `depth`            | `[1, 3, height, width]` or `[1, views, 3, height, width]` normalized RGB | [Depth Anything 3 small](https://huggingface.co/grabbou/depth-anything-3-small-CoreAI)         | `depth` (float32 tensor at model resolution, relative, smaller is nearer), `min`, `max`, and `image` (base64 grayscale PNG at the input size, nearer is brighter) |

```ts
const { output } = await CoreAI.runTask(
  'classification',
  { id: 'pvt-v2-b0', source: folder },
  { imageUri },
  { topK: 3 }
)
```

- Classification and depth normalize RGB with the ImageNet mean and std unless you pass `mean` and `std`. Classification reads class names from `options.labels`, or from a `labels.json` array next to the model, and `source` can be the folder holding both.
- Models that take several views, like Depth Anything 3, get the image as every view, and the output is the depth of the first.
- Models stay loaded after the first call, by path and `computeUnits`.

### Raw Function Calls

Any exported `.aimodel` runs through its functions, for models that have no task wrapper. Load it with the `raw` task, which needs no `coreai-models` product, and call a function by name with tensors:

```ts
import { CoreAI, createTensor, readTensor } from '@react-native-ai/core-ai'

const { modelHandle, info } = await CoreAI.loadModel(
  { id: 'edsr-x2', source: uri, task: 'raw' },
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

### Video Segmentation

`CoreAI.runTask('video-segmentation', config, input, options)` runs `coreai-models` video segmentation bundles (SAM 3 video): it finds the objects that text prompts describe in a video and tracks them from frame to frame.

```ts
const { output } = await CoreAI.runTask(
  'video-segmentation',
  { id: 'sam3-video', source: bundle },
  { videoUri, data: { prompts: ['cat', 'person'] } },
  { maxFrames: 120, outputVideo: true }
)
// output.frames[i].objects: [{ id, prompt, score, box }], ids stay the same across frames
// output.video: file:// URL of a copy with the masks and boxes drawn on
```

- One prompt can also go in `input.text`.
- `includeMasks: true` adds each object's mask as a base64 PNG at the video size, which is large for long videos.
- `scoreThreshold` (0.5), `newObjectThreshold` (0.7) and `maxObjects` tune tracking.
- The bundle stays loaded after the first call. The [hosted SAM 3 video export](https://huggingface.co/grabbou/sam3-video-CoreAI) runs at 672 px, a balance of speed and accuracy on iPhone. The recipe also exports 336 px (faster) and 1008 px (more accurate on small objects): `uv run models/sam3_video/export.py --image-size 336`. SAM 3 is gated on Hugging Face, so exporting it needs Meta's license accepted, and the weights stay under the [SAM License](https://huggingface.co/facebook/sam3/blob/main/LICENSE).

When the AI SDK owns message history, every request sends the whole chat. To
keep it inside the context window, see
[Conversation History](https://react-native-ai.dev/docs/history).

## Loading Models

Core AI loads models from local `.aimodel` / `.aimodelc` files and model folders. `source` is a path or `file://` URL in app storage, or `bundle://` and a path in the app bundle for a model shipped with the app:

```ts
const downloaded = coreAI.languageModel({ source: `${modelsDirectory}/qwen3-0.6b` })
const bundled = coreAI.languageModel({ source: 'bundle://models/qwen3-0.6b' })
```

`id` is optional. It names the model in AI SDK results and telemetry, and defaults to the folder or `.aimodel` name (`qwen3-0.6b` above). Built-in download, specialization and caching is tracked in [#235](https://github.com/callstackincubator/ai/issues/235).

## Starter Models

The package does not ship a model catalog. The [starter models](./models.md) page is a reference list of models known to work; your app decides which models to bundle or download.
