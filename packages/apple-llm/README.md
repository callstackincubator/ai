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
- ✅ Opt-in Apple Core AI for app-provided `.aimodel` bundles (`coreAI`)

## Core AI

`coreAI` runs model bundles exported from
[`apple/coreai-models`](https://github.com/apple/coreai-models). It is opt-in,
so apps that only use Apple Intelligence keep their deployment target and
simulator builds. Set `APPLE_CORE_AI=1` when installing pods to link the
`coreai-models` Swift Package (or list a subset in `CORE_AI_PRODUCTS`). Linked
Core AI needs an iOS 27 deployment target and a physical device.

```ts
import { coreAI } from '@react-native-ai/apple'
import { streamText } from 'ai'

const model = coreAI.languageModel({
  id: 'qwen3-0.6b',
  source: { type: 'file', uri: qwen3ModelDirectory },
  variant: 'iOS',
})

const result = streamText({ model, prompt: 'Explain Core AI in one sentence.' })
```

See the [Core AI documentation](https://react-native-ai.dev/docs/core-ai/getting-started).

## Documentation

For complete installation instructions and API documentation, visit our [documentation site](https://react-native-ai.com/docs/apple).

## License

MIT

---

Made with ❤️ and [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
