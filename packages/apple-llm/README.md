# Apple Provider for Vercel AI SDK

A Vercel AI SDK provider for Apple Foundation Models, enabling access to Apple Intelligence in React Native applications.

**Requirements:**

- iOS 26+ for text generation
- iOS 26.4+ for token counting and Image Playground generation
- iOS 27+ for image prompts, Private Cloud Compute, and Vision built-in tools
- Apple Intelligence enabled device
- Vercel AI SDK v7
- React Native New Architecture

```ts
import { apple } from '@react-native-ai/apple'
import { generateText } from 'ai'

const answer = await generateText({
  model: apple(),
  prompt: 'What is the meaning of life?',
})
```

For reusable history utilities such as summarization, rolling windows, and
completed tool-call pruning, use `@react-native-ai/utils`.

## iOS 26 and iOS 27

The provider runs on both. iOS 26.4 and iOS 27 features also need an app built
with an SDK that has them (Xcode 26 with Swift 6.3, and Xcode 27).

| Feature                             | iOS 26 | iOS 26.4 | iOS 27                  |
| ----------------------------------- | ------ | -------- | ----------------------- |
| Text, streaming, structured output  | ✅     | ✅       | ✅                      |
| JavaScript tools                    | ✅     | ✅       | ✅                      |
| Tool calls while streaming          | ❌     | ❌       | ✅                      |
| `toolChoice: 'auto'` and `'none'`   | ✅     | ✅       | ✅                      |
| `toolChoice: 'required'`            | ❌     | ❌       | ❌                      |
| Token counting and context size     | ❌     | ✅       | ✅                      |
| Image Playground generation         | ❌     | ✅       | ✅ Adds more styles     |
| Reasoning level and reasoning parts | ❌     | ❌       | ✅                      |
| Image prompts                       | ❌     | ❌       | ✅                      |
| Private Cloud Compute               | ❌     | ❌       | ✅ Physical device only |
| Vision OCR and barcode tools        | ❌     | ❌       | ✅ Physical device only |
| Token usage                         | ❌     | ❌       | ✅                      |

Apple runs tools itself, so a tool call cannot be forced on any version.

See [iOS Versions](https://react-native-ai.dev/docs/apple/ios-versions) for details.

## Features

- ✅ Text generation with Apple Foundation Models
- ✅ Image prompts on iOS 27+
- ✅ Runtime model info and context-size metadata
- ✅ Private Cloud Compute language model selection on iOS 27+
- ✅ Reasoning level control on iOS 27+
- ✅ Structured outputs
- ✅ Tool calling
- ✅ Vision OCR and barcode built-in tools on iOS 27+
- ✅ Streaming
- ✅ Image Playground generation through the AI SDK image API

## Documentation

For complete installation instructions and API documentation, visit our [documentation site](https://react-native-ai.com/docs/apple).

## License

MIT

---

Made with ❤️ and [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
