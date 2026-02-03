# Llama Provider for Vercel AI SDK

A Vercel AI SDK provider for llama.rn, enabling on-device inference with GGUF models in React Native applications.

**Requirements:**
- React Native >= 0.76.0
- llama.rn >= 0.10.0-rc.0
- Vercel AI SDK v5

```ts
import { llama } from '@react-native-ai/llama'
import { generateText } from 'ai'

// Create model (format: "owner/repo/filename.gguf")
const model = llama.languageModel(
  'ggml-org/SmolLM3-3B-GGUF/SmolLM3-Q4_K_M.gguf'
)

// Download and prepare
await model.download()
await model.prepare()

// Generate
const { text } = await generateText({
  model,
  prompt: 'Write a haiku about coding.'
})
```

## Features

- ✅ Text generation with GGUF models
- ✅ Streaming
- ✅ On-device inference (iOS & Android)
- ✅ Model download management
- ✅ GPU acceleration support

## Documentation

For complete installation instructions and API documentation, visit our [documentation site](https://react-native-ai.com/docs/llama).

## License

MIT

---

Made with ❤️ and [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
