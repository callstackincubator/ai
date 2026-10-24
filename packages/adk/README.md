# ADK Provider for Vercel AI SDK

A Vercel AI SDK provider for [Google's Agent Development Kit (ADK)](https://developer.android.com/ai/adk), enabling on-device Gemini Nano and cloud Gemini in React Native applications on Android.

**Requirements:**

- Android only, with `minSdkVersion` 26+ set in your app
- A device that supports Gemini Nano through AICore for on-device inference (see [ML Kit GenAI device support](https://developers.google.com/ml-kit/genai#feature-device))
- A Google AI API key for cloud Gemini
- Vercel AI SDK v7
- React Native New Architecture

Your app also has to exclude duplicate `META-INF` files from Android packaging. See [Getting Started](https://react-native-ai.com/docs/adk/getting-started) for the Expo and bare React Native setup.

```ts
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

const { text } = await generateText({
  model: adk(),
  prompt: 'Summarize on-device AI in one sentence.',
})
```

## Features

- ✅ On-device Gemini Nano through ML Kit GenAI, with model selection
- ✅ Cloud Gemini through ADK `LlmAgent`
- ✅ Availability, download progress and token counting for Gemini Nano
- ✅ Streaming
- ✅ Tool calling, with the agent loop run natively by ADK
- ✅ Structured outputs
- ✅ Reasoning
- ✅ Image prompts
- ✅ Token usage
- ✅ Error codes

## Documentation

For complete installation instructions and API documentation, visit our [documentation site](https://react-native-ai.com/docs/adk).

## License

MIT

---

Made with ❤️ and [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
