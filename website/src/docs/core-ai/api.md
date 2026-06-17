# API Surface

Core AI has two API layers.

## AI SDK Adapters

Use these when you want portable AI SDK app code:

```typescript
import { coreAI } from '@react-native-ai/core-ai'
import { embed, experimental_transcribe, generateImage, generateText } from 'ai'

const language = coreAI.languageModel({
  id: 'qwen3-0.6b',
  source: { type: 'file', uri: qwen3ModelDirectory },
  variant: 'iOS',
})

await generateText({ model: language, prompt: 'Hello' })
```

AI SDK adapter status:

| Capability        | AI SDK API                                    | Core AI API                      | Status                           |
| ----------------- | --------------------------------------------- | -------------------------------- | -------------------------------- |
| Language text     | `generateText`, `streamText`                  | `coreAI.languageModel(...)`      | Native wrapper implemented       |
| Structured output | `generateText` / `streamText` response format | `coreAI.languageModel(...)`      | Routed through language sessions |
| Image generation  | `generateImage`                               | `coreAI.imageModel(...)`         | Native diffusion wrapper         |
| Text embeddings   | `embed`, `embedMany`                          | `coreAI.embeddingModel(...)`     | Explicit unsupported error       |
| Transcription     | `experimental_transcribe`                     | `coreAI.transcriptionModel(...)` | Explicit unsupported error       |

The embedding and transcription adapters are present because AI SDK has matching interfaces and Apple’s registry has starter export recipes. They reject until this package gets task-specific native runners for CLIP/CLAP and wav2vec2/Whisper outputs.

Reranking, speech generation, and video generation are intentionally not exposed as working Core AI adapters yet. AI SDK has model interfaces for reranking and speech, but Apple’s current `coreai-models` registry does not provide a Core AI reranker, TTS model, or video-generation starter. Use `@react-native-ai/apple` for system speech synthesis.

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

const model = coreAI.languageModel({
  ...config,
})

await model.prepare()

const session = await model.createSession({
  instructions: 'Keep answers short.',
})

await session.respond('Create a vocabulary card for "flower".')
```

Native-only API status:

| Capability           | API                                       | Status                     | Why native-only                                                            |
| -------------------- | ----------------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| Model inspection     | `CoreAI.inspectModel(...)`                | Implemented                | AI SDK does not manage Core AI asset metadata.                             |
| Specialization       | `CoreAI.specializeModel(...)`             | Metadata stub              | Core AI-specific preparation step.                                         |
| Persistent sessions  | `model.createSession(...)`                | Implemented for LLMs       | AI SDK owns message history; Core AI sessions own native transcript state. |
| Segmentation         | `CoreAI.runTask('segmentation', ...)`     | Implemented                | AI SDK image APIs do not model segmentation masks.                         |
| Object detection     | `CoreAI.runTask('object-detection', ...)` | Implemented                | AI SDK has no detection primitive.                                         |
| Depth estimation     | `CoreAI.runTask('depth', ...)`            | Explicit unsupported error | AI SDK has no depth primitive.                                             |
| Super-resolution     | `CoreAI.runTask('super-resolution', ...)` | Explicit unsupported error | AI SDK has no image-to-image upscaling primitive.                          |
| Raw `.aimodel` calls | `CoreAI.runRawFunction(...)`              | Explicit unsupported error | Raw tensor APIs need Core AI-specific ownership and performance rules.     |

## Model Management TBD

Core AI still needs a model-management layer for remote assets. Apple’s Core AI APIs load and specialize local `.aimodel` or `.aimodelc` URLs, so remote models need to be downloaded into app storage before they can be used.

The intended follow-up is to add APIs that can download a model bundle, return a local `source: { type: 'file', uri }`, optionally call Core AI specialization ahead of first use, and persist bookmark data for specialized cached assets. This should reuse shared download and storage helpers with other runtimes where practical, instead of creating a separate downloader for every provider.

## Starter Models

The starter model list in these docs is informational only. The package does not ship a static model catalog; apps should load available models dynamically from their own bundle, download state, or registry integration.
