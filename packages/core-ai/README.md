# @react-native-ai/core-ai

Apple Core AI provider for React Native AI. It runs model bundles exported with [`apple/coreai-models`](https://github.com/apple/coreai-models) on Apple's Core AI runtime, with the Vercel AI SDK and direct native calls.

For Apple's built-in system models (Foundation Models, NLContextualEmbedding, SpeechAnalyzer, AVSpeechSynthesizer), use `@react-native-ai/apple`.

| Task             | API                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| Text generation  | `generateText`, `streamText` with `coreAI.languageModel`                                                           |
| Image generation | `generateImage` with `coreAI.imageModel`                                                                           |
| Video generation | `experimental_generateVideo` with `coreAI.videoModel`                                                              |
| Transcription    | `transcribe`, `experimental_streamTranscribe` with `coreAI.transcriptionModel`                                     |
| Embeddings       | `embed`, `embedMany` with `coreAI.embeddingModel`                                                                  |
| Vision           | `CoreAI.runTask(...)`: object detection, segmentation, video segmentation, super-resolution, classification, depth |
| Any `.aimodel`   | `CoreAI.runRawFunction(...)`                                                                                       |

## Installation

```bash
npm install @react-native-ai/core-ai @react-native-ai/apple ai
```

Requirements:

- React Native New Architecture
- Xcode 27 or newer, and an iOS 27 deployment target
- A physical device: the iOS Simulator SDK has no `CoreAI` framework

With Expo, add the config plugin, which sets the deployment target:

```json
{
  "expo": {
    "plugins": ["@react-native-ai/core-ai"]
  }
}
```

## Usage

```ts
import { coreAI } from '@react-native-ai/core-ai'
import { streamText } from 'ai'

const model = coreAI.languageModel({
  id: 'qwen3-0.6b',
  source: qwen3ModelDirectory,
})

const result = streamText({
  model,
  prompt: 'Explain Core AI in one sentence.',
})
```

## Documentation

- [Getting started](https://react-native-ai.dev/docs/core-ai/getting-started): installation, native setup and linked tasks
- [Generating](https://react-native-ai.dev/docs/core-ai/generating), [Images and Video](https://react-native-ai.dev/docs/core-ai/images-and-video), [Transcription](https://react-native-ai.dev/docs/core-ai/transcription), [Embeddings](https://react-native-ai.dev/docs/core-ai/embeddings), [Vision](https://react-native-ai.dev/docs/core-ai/vision) and [Raw Function Calls](https://react-native-ai.dev/docs/core-ai/raw-functions)
- [Models](https://react-native-ai.dev/docs/core-ai/models): hosted exports for every task, and how to export your own
