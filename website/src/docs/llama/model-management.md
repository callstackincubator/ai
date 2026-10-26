# Model Management

The llama provider runs any GGUF model from
[Hugging Face](https://huggingface.co/models?library=gguf). This page covers
choosing, downloading, loading, and removing models, and lists every model
option.

## Recommended Models

These run well on recent phones and are used throughout these docs:

| Model ID                                                              | Size   | Use                                  |
| --------------------------------------------------------------------- | ------ | ------------------------------------ |
| `bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf`          | 1.4 GB | Chat, reasoning, tool calling        |
| `ggml-org/gemma-4-E2B-it-GGUF/gemma-4-E2B-it-Q4_0.gguf`               | 2.8 GB | Images and audio, with its projector |
| `nomic-ai/nomic-embed-text-v1.5-GGUF/nomic-embed-text-v1.5.Q8_0.gguf` | 146 MB | [Embeddings](./embeddings)           |
| `gpustack/bge-reranker-v2-m3-GGUF/bge-reranker-v2-m3-Q4_K_M.gguf`     | 438 MB | [Reranking](./reranking)             |
| `OuteAI/OuteTTS-0.3-500M-GGUF/OuteTTS-0.3-500M-Q4_K_M.gguf`           | 403 MB | [Speech](./speech), with a vocoder   |

The suffix is the quantization. Lower levels such as Q3 are smaller and faster
but lose quality, and Q4_K_M is a good balance on mobile. The model also needs
memory for its context on top of the file size.

Licenses differ between models, and some limit commercial use, so check the
model card before shipping one.

## Downloading

`downloadModel` fetches a model from Hugging Face and returns its local path.
Model IDs are `owner/repo/filename.gguf`. A model that is already on the
device is not downloaded again:

```typescript
import { downloadModel } from '@react-native-ai/llama'

const modelPath = await downloadModel(
  'bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf',
  ({ percentage }) => console.log(`Downloaded ${percentage}%`)
)
```

To check for a model without downloading it:

```typescript
import { getModelPath, isModelDownloaded } from '@react-native-ai/llama'

const modelId = 'bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf'

if (await isModelDownloaded(modelId)) {
  const modelPath = getModelPath(modelId)
}
```

Models are stored in `llama-models/` in the app's documents directory, by
file name. Two repositories with the same file name share one file.

## Removing Models

List what is on the device and delete models you no longer need:

```typescript
import { getDownloadedModels, removeModel } from '@react-native-ai/llama'

const models = await getDownloadedModels()
// [{ model_id, path, filename, sizeBytes }]

await removeModel('bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf')
```

`removeModel` takes the full model ID. `getDownloadedModels` only knows file
names, so its `model_id` is the file name, which `removeModel` rejects. Keep the
full IDs of the models your app downloads, and match them to the listed files
by `filename`.

## Creating Model Instances

Create a model from the downloaded path. Each model type has its own factory,
with the options listed in the [API reference](#api-reference):

```typescript
import { llama } from '@react-native-ai/llama'

const languageModel = llama.languageModel(modelPath, {
  contextParams: { n_ctx: 4096 },
})
const embeddingModel = llama.embeddingModel(embeddingModelPath)
const rerankingModel = llama.rerankingModel(rerankingModelPath)
const speechModel = llama.speechModel(speechModelPath, { vocoderPath })
```

## Loading and Unloading

`prepare()` loads the model into memory. Call it ahead of time, since loading
takes a while. Without it, the first request loads the model and logs a
warning. `unload()` frees the memory:

```typescript
await model.prepare()

// ...use the model

await model.unload()
```

For llama.rn features the provider does not cover, use the underlying
`LlamaContext`, which is available once the model is prepared:

```typescript
await model.prepare()
const context = model.getContext()
```

## API Reference

`llama` is the default provider. `createLlamaProvider()` creates another one.
Every model has `prepare()`, `getContext()`, and `unload()`, and takes llama.rn
[context parameters](https://github.com/mybigday/llama.rn) in `contextParams`.

### `llama.languageModel(modelPath, options?)`

| Option                       | Default                     | Description                                                                                                                    |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `projectorPath`              |                             | Multimodal projector (`mmproj`), required for images and audio                                                                 |
| `projectorUseGpu`            | `true`                      | Run the projector on the GPU                                                                                                   |
| `projectorImageMaxTokens`    | A quarter of `n_ctx`        | Most tokens one image can take, for models that size images dynamically. Full-resolution photos can otherwise fill the context |
| `contextParams.n_ctx`        | 2048, 4096 with a projector | Context size in tokens                                                                                                         |
| `contextParams.n_gpu_layers` | 99                          | Layers offloaded to the GPU                                                                                                    |

:::warning
Keep `contextParams.state_cache_budget_mb` at its default, `0`. It turns on
llama.rn's prefix cache for recurrent and hybrid models such as Qwen3.5, and
llama.rn crashes on the completion after a tool call or structured output when
it is on.
:::

### `llama.embeddingModel(modelPath, options?)`

| Option                       | Default | Description                                                                                   |
| ---------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| `normalize`                  | -1      | -1 for none, 0 for max absolute int16, 1 for taxicab, 2 for euclidean, above 2 for p-norm     |
| `contextParams.n_ctx`        | 2048    | Context size in tokens, the longest text one value can be                                     |
| `contextParams.n_gpu_layers` | 99      | Layers offloaded to the GPU                                                                   |
| `contextParams.n_parallel`   | 8       | Values embedded per call. Calls run one at a time, since a context embeds one value at a time |

### `llama.rerankingModel(modelPath, options?)`

| Option                       | Default         | Description                 |
| ---------------------------- | --------------- | --------------------------- |
| `normalize`                  | The model's own | Score normalization         |
| `contextParams.n_ctx`        | 2048            | Context size in tokens      |
| `contextParams.n_gpu_layers` | 99              | Layers offloaded to the GPU |

### `llama.speechModel(modelPath, options)`

| Option             | Default | Description                                                                                                                                                              |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vocoderPath`      |         | Required. A [codec.cpp](https://github.com/mybigday/codec.cpp) vocoder GGUF, e.g. `BricksDisplay/codec.cpp-gguf/wavtokenizer-large-speech-75tokens.gguf` for OuteTTS 0.3 |
| `vocoderBatchSize` |         | Batch size for the vocoder                                                                                                                                               |

### Storage Functions

| Function                              | Returns                | Description                                           |
| ------------------------------------- | ---------------------- | ----------------------------------------------------- |
| `downloadModel(modelId, onProgress?)` | `Promise<string>`      | Downloads a model if needed and returns its path      |
| `getModelPath(modelId)`               | `string`               | Where the model is or would be stored                 |
| `isModelDownloaded(modelId)`          | `Promise<boolean>`     | Whether the model file exists                         |
| `getDownloadedModels()`               | `Promise<ModelInfo[]>` | Every downloaded `.gguf` file, with its size in bytes |
| `removeModel(modelId)`                | `Promise<void>`        | Deletes the model file                                |
