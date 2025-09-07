[![image](https://github.com/user-attachments/assets/027ccbc1-c6c4-46a0-aa62-7b89d4e62f24)](https://www.callstack.com/open-source?utm_campaign=generic&utm_source=github&utm_medium=referral&utm_content=react-native-ai)

# React Native AI

A collection of on-device AI primitives for React Native with first-class Vercel AI SDK support. Run AI models directly on users' devices for privacy-preserving, low-latency inference without server costs.

## Features

- 🚀 **Instant AI** - Use built-in system models immediately without downloads
- 🔒 **Privacy-first** - All processing happens on-device, data stays local
- 🎯 **Vercel AI SDK compatible** - Drop-in replacement with familiar APIs
- 🎨 **Complete toolkit** - Text generation, embeddings, transcription, speech synthesis

## Available Providers

### Apple

Native integration with Apple's on-device AI capabilities:

- **Text Generation** - Apple Foundation Models for chat and completion
- **Embeddings** - NLContextualEmbedding for 512-dimensional semantic vectors
- **Transcription** - SpeechAnalyzer for fast, accurate speech-to-text
- **Speech Synthesis** - AVSpeechSynthesizer for natural text-to-speech with system voices

```typescript
import { apple } from '@react-native-ai/apple'
import { 
  generateText,
  embed, 
  experimental_transcribe as transcribe, 
  experimental_generateSpeech as speech 
} from 'ai'

// Text generation with Apple Intelligence
const { text } = await generateText({
  model: apple(),
  prompt: 'Explain quantum computing'
})

// Generate embeddings
const { embedding } = await embed({
  model: apple.textEmbeddingModel(),
  value: 'Hello world'
})

// Transcribe audio
const { text } = await transcribe({
  model: apple.transcriptionModel(),
  audio: audioBuffer
})

// Text-to-speech
const { audio } = await speech({
  model: apple.speechModel(),
  text: 'Hello from Apple!'
})
```

#### Availability

| Feature | iOS Version | Additional Requirements |
|---------|-------------|------------------------|
| Text Generation | iOS 26+ | Apple Intelligence device |
| Embeddings | iOS 17+ | - |
| Transcription | iOS 26+ | - |
| Speech Synthesis | iOS 13+ | iOS 17+ for Personal Voice |

### MLC Engine (Work in Progress)

Run any open-source LLM locally using MLC's optimized runtime. Currently in development and not recommended for production use.

```typescript
import { getModel, prepareModel } from 'react-native-ai'
import { streamText } from 'ai'

// Download and prepare model
await prepareModel('Llama-3.2-3B-Instruct')

// Stream responses
const { textStream } = await streamText({
  model: getModel('Llama-3.2-3B-Instruct'),
  messages: [{ role: 'user', content: 'Hello!' }]
})
```

> **Note:** MLC support is experimental. Follow the [setup guide](https://react-native-ai.dev/docs/mlc/overview) for detailed installation instructions.

### Google (Coming Soon)

Support for Google's on-device models is planned for future releases.

## Documentation

Comprehensive guides and API references are available at [react-native-ai.dev](https://react-native-ai.dev).

## Contributing

Read the [contribution guidelines](/CONTRIBUTING.md) before contributing.

## Made with ❤️ at Callstack

**react-native-ai** is an open source project and will always remain free to use. If you think it's cool, please star it 🌟. 

[Callstack][callstack-readme-with-love] is a group of React and React Native geeks, contact us at [hello@callstack.com](mailto:hello@callstack.com) if you need any help with these or just want to say hi!

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)

[callstack-readme-with-love]: https://callstack.com/?utm_source=github.com&utm_medium=referral&utm_campaign=react-native-ai&utm_term=readme-with-love
