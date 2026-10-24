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

| Capability        | AI SDK API                                    | Core AI API                      | Status                   |
| ----------------- | --------------------------------------------- | -------------------------------- | ------------------------ |
| Text generation   | `generateText`, `streamText`                  | `coreAI.languageModel(...)`      | Supported                |
| Structured output | `generateText` / `streamText` response format | `coreAI.languageModel(...)`      | Not supported yet        |
| Tool calling      | `tools` option                                | `coreAI.languageModel(...)`      | Not supported yet        |
| Image generation  | `generateImage`                               | `coreAI.imageModel(...)`         | Supported                |
| Text embeddings   | `embed`, `embedMany`                          | `coreAI.embeddingModel(...)`     | Throws unsupported error |
| Transcription     | `transcribe`                                  | `coreAI.transcriptionModel(...)` | Throws unsupported error |

`coreAI.embeddingModel(...)` and `coreAI.transcriptionModel(...)` exist so the API is in place, but they throw until the package has native runners for CLIP/CLAP and wav2vec2/Whisper models ([#237](https://github.com/callstackincubator/ai/issues/237)).

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
| Raw `.aimodel` calls | `CoreAI.runRawFunction(...)`              | Throws unsupported error                | Raw tensor APIs need Core AI-specific ownership and performance rules.     |

When the AI SDK owns message history, every request sends the whole chat. To
keep it inside the context window, see
[Conversation History](../history.md).

## Loading Models

Core AI loads models from local `.aimodel` / `.aimodelc` files, so download them into app storage yourself and pass a local `source: { type: 'file', uri }`. Built-in download, specialization and caching is tracked in [#235](https://github.com/callstackincubator/ai/issues/235).

## Starter Models

The package does not ship a model catalog. The [starter models](./models) page is a reference list of models known to work; your app decides which models to bundle or download.
