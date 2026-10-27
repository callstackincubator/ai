# @react-native-ai/llama

**Open-weight GGUF models on iOS and Android, as a Vercel AI SDK provider for React Native.**

Download a model such as Qwen, Llama or Gemma from Hugging Face, load it into
memory and run it fully on-device with
[llama.rn](https://github.com/mybigday/llama.rn).

The provider covers text generation, embeddings, reranking and speech, each
with a model trained for that task.

Use it when you need the same models on both platforms, or a model the system
doesn't provide. For models built into the OS, see
[`@react-native-ai/apple`](../apple-llm) (iOS) and
[`@react-native-ai/adk`](../adk) (Android).

## Features

| Capability      | Method                   | AI SDK function             | Model                                   |
| --------------- | ------------------------ | --------------------------- | --------------------------------------- |
| Text generation | `llama.languageModel()`  | `generateText`/`streamText` | Chat or instruct model                  |
| Embeddings      | `llama.embeddingModel()` | `embed`/`embedMany`         | Embedding model                         |
| Reranking       | `llama.rerankingModel()` | `rerank`                    | Reranker model                          |
| Speech          | `llama.speechModel()`    | `generateSpeech`            | TTS model and a vocoder (`vocoderPath`) |

Language models support:

- Streaming
- Reasoning, controlled with the AI SDK `reasoning` option
- Structured output (`Output.object`), enforced with a JSON schema grammar
- Tool calling
- Vision and audio input with a multimodal projector (`projectorPath`)
- GPU acceleration

Model download management (`downloadModel`, `getDownloadedModels`,
`removeModel`) is included.

## Requirements

- React Native 0.76+
- llama.rn 0.13.0-rc.8+ (required for React Native 0.88)
- Vercel AI SDK v7

## Installation

```bash
npm install @react-native-ai/llama llama.rn react-native-blob-util ai
```

## Usage

```ts
import { downloadModel, llama } from '@react-native-ai/llama'
import { generateText } from 'ai'

// Model ID format: "owner/repo/filename.gguf"
const modelPath = await downloadModel(
  'bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf',
  (progress) => console.log(`Downloading: ${progress.percentage}%`)
)

const model = llama.languageModel(modelPath)
await model.prepare()

const { text } = await generateText({
  model,
  prompt: 'Write a haiku about coding.',
})

await model.unload()
```

Any GGUF model from Hugging Face whose architecture llama.cpp supports works.

## Documentation

Guides and API reference are on the [documentation site](https://react-native-ai.dev/docs/llama/getting-started).

## License

MIT

---

Made with ❤️ and [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
