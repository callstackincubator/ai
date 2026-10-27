# @react-native-ai/core-ai

Bring your own model to iPhone and run it on Apple's Core AI framework. Start
from a [hosted export](https://react-native-ai.dev/docs/core-ai/models), such
as Qwen3 for chat or FLUX.2 for images, or export your own with
[`apple/coreai-models`](https://github.com/apple/coreai-models), and run it
on-device from React Native. Use it for text, image and video generation, transcription, embeddings,
and vision tasks such as segmentation and object detection.

It also comes as a [Vercel AI SDK](https://ai-sdk.dev) provider, so it drops
into code that already uses the AI SDK.

For Apple's built-in system models (Foundation Models, NLContextualEmbedding, SpeechAnalyzer, AVSpeechSynthesizer), use [`@react-native-ai/apple`](../apple-llm).

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
