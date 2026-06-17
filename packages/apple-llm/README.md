# Apple Provider for Vercel AI SDK

A Vercel AI SDK provider for Apple Foundation Models, enabling access to Apple Intelligence in React Native applications.

**Requirements:**

- iOS 26+ for text generation
- iOS 26.4+ for token counting and Image Playground generation
- iOS 27+ for image prompts, Private Cloud Compute, and Vision built-in tools
- Apple Intelligence enabled device
- Vercel AI SDK v5
- React Native New Architecture

```ts
import { apple } from '@react-native-ai/apple'
import { generateText } from 'ai'

const answer = await generateText({
  model: apple(),
  prompt: 'What is the meaning of life?',
})
```

```ts
const summarizerModel = apple()

const model = apple()
  .summarizeHistory(5000, summarizerModel)
  .rollingWindow(10)
  .droppingCompletedToolCalls()
```

## Features

- ✅ Text generation with Apple Foundation Models
- ✅ Image prompts on iOS 27+
- ✅ Runtime model info and context-size metadata
- ✅ Private Cloud Compute language model selection on iOS 27+
- ✅ Structured outputs
- ✅ Tool calling
- ✅ History management helpers for summarization, rolling windows, and completed tool-call pruning
- ✅ Vision OCR and barcode built-in tools on iOS 27+
- ✅ Streaming
- ✅ Image Playground generation through the AI SDK image API

## Documentation

For complete installation instructions and API documentation, visit our [documentation site](https://react-native-ai.com/docs/apple).

## License

MIT

---

Made with ❤️ and [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
