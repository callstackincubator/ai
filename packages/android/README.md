# Android Provider for Vercel AI SDK

A Vercel AI SDK provider that runs Gemini Nano on device in React Native apps on Android, through Google's [ML Kit GenAI](https://developers.google.com/ml-kit/genai) libraries.

**Requirements:**

- Android only, with `minSdkVersion` 26+ and Kotlin 2.4+ set in your app
- A device that supports Gemini Nano through AICore (see [ML Kit GenAI device support](https://developers.google.com/ml-kit/genai#feature-device))
- Vercel AI SDK v7
- React Native New Architecture

See [Getting Started](https://react-native-ai.com/docs/android/getting-started) for the Expo and bare React Native setup.

```ts
import { android } from '@react-native-ai/android'
import { generateText } from 'ai'

const { text } = await generateText({
  model: android(),
  prompt: 'Summarize on-device AI in one sentence.',
})
```

## Features

- ✅ Gemini Nano text generation and streaming (`genai-prompt`)
- ✅ System instructions, conversations, image prompts and thinking mode
- ✅ Tool calling with AI SDK tools, on Gemini Nano 4 (`genai-prompt` function calling)
- ✅ Availability, model selection, download progress and token counting
- ✅ Transcription of audio files (`genai-speech-recognition`)
- ✅ Embeddings (`genai-embedding`)
- ✅ Error codes

ML Kit only generates structured output for Kotlin classes compiled at build time, so JSON output returns an `unsupported` warning.

## Documentation

For complete installation instructions and API documentation, visit our [documentation site](https://react-native-ai.com/docs/android).

## License

MIT
