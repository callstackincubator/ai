# @react-native-ai/apple

Use the AI built into iOS from React Native. Apple Intelligence (Foundation
Models), text embeddings, speech-to-text and text-to-speech run on-device with
the models that ship with the system, so there is nothing to download or
bundle. The package comes with a [Vercel AI SDK](https://ai-sdk.dev) provider,
so you can call these models with `generateText`, `streamText`, `embed`,
`transcribe` and `generateSpeech`.

To run models you choose and ship yourself, see
[`@react-native-ai/core-ai`](../core-ai) or
[`@react-native-ai/llama`](../llama).

## Features

| Capability       | Apple framework                                                                                          | AI SDK function             | iOS  |
| ---------------- | -------------------------------------------------------------------------------------------------------- | --------------------------- | ---- |
| Text generation  | [Foundation Models](https://developer.apple.com/documentation/FoundationModels)                          | `generateText`/`streamText` | 26+  |
| Embeddings       | [NLContextualEmbedding](https://developer.apple.com/documentation/naturallanguage/nlcontextualembedding) | `embed`/`embedMany`         | 17+  |
| Transcription    | [SpeechAnalyzer](https://developer.apple.com/documentation/speech/speechanalyzer)                        | `transcribe`                | 26+  |
| Speech synthesis | [AVSpeechSynthesizer](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer)            | `generateSpeech`            | 13+  |
| Image generation | Image Playground                                                                                         | `generateImage`             | 26.4 |

Text generation supports streaming, structured output, tool calling, image
prompts, reasoning levels and Private Cloud Compute. Each capability also has a
native API (`AppleFoundationModels`, `AppleEmbeddings`, `AppleTranscription`,
`AppleSpeech`) for features outside the AI SDK, such as live microphone
transcription on iOS 27 and voice listing.

## Requirements

- iOS 26+ and a device with Apple Intelligence enabled, for text generation
- React Native New Architecture
- Vercel AI SDK v7

## Installation

```bash
npm install @react-native-ai/apple ai
```

The package is autolinked, so there is no native setup.

## Usage

```ts
import { apple } from '@react-native-ai/apple'
import { embed, generateSpeech, generateText, transcribe } from 'ai'

const { text } = await generateText({
  model: apple(),
  prompt: 'Explain quantum computing in one sentence.',
})

const { embedding } = await embed({
  model: apple.embeddingModel(),
  value: 'Hello world',
})

const { text: transcript } = await transcribe({
  model: apple.transcriptionModel(),
  audio: audioBuffer,
})

const { audio } = await generateSpeech({
  model: apple.speechModel(),
  text: 'Hello from Apple!',
})
```

Check `await apple.isAvailable()` before generating text, since Apple
Intelligence can be off or still downloading. For long chats on the small
on-device context window, wrap the model with `@react-native-ai/utils`.

## iOS 26 and iOS 27

The provider runs on both. iOS 26.4 and iOS 27 features also need an app built
with an SDK that has them (Xcode 26 with Swift 6.3, and Xcode 27).

| Feature                                 | iOS 26 | iOS 26.4 | iOS 27                  |
| --------------------------------------- | ------ | -------- | ----------------------- |
| Text, streaming, structured output      | ✅     | ✅       | ✅                      |
| JavaScript tools                        | ✅     | ✅       | ✅                      |
| Tool calls while streaming              | ❌     | ❌       | ✅                      |
| `toolChoice: 'auto'` and `'none'`       | ✅     | ✅       | ✅                      |
| `toolChoice: 'required'`, named tool    | ❌     | ❌       | ✅                      |
| Token counting and context size         | ❌     | ✅       | ✅                      |
| Image Playground generation             | ❌     | ✅       | ❌ Removed by Apple     |
| Reasoning level and reasoning parts     | ❌     | ❌       | ✅                      |
| Image prompts                           | ❌     | ❌       | ✅                      |
| Private Cloud Compute                   | ❌     | ❌       | ✅ Physical device only |
| Vision OCR, barcode and Spotlight tools | ❌     | ❌       | ✅ Physical device only |
| Token usage                             | ❌     | ❌       | ✅                      |
| Live microphone transcription           | ❌     | ❌       | ✅ Physical device only |

See [iOS Versions](https://react-native-ai.dev/docs/apple/ios-versions) for details.

## Documentation

Guides and API reference are on the [documentation site](https://react-native-ai.dev/docs/apple/getting-started).

## License

MIT

---

Made with ❤️ and [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
