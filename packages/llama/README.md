# Llama Provider for Vercel AI SDK

A Vercel AI SDK provider for llama.rn, enabling on-device inference with GGUF models in React Native applications.

**Requirements:**
- React Native >= 0.76.0
- llama.rn >= 0.13.0-rc.8 (required for React Native 0.88)
- Vercel AI SDK v7

```ts
import { downloadModel, llama } from '@react-native-ai/llama'
import { generateText } from 'ai'

// Download (format: "owner/repo/filename.gguf") and prepare
const modelPath = await downloadModel(
  'bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf'
)
const model = llama.languageModel(modelPath)
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
- ✅ Reasoning, controlled with the AI SDK `reasoning` option
- ✅ Structured output (`Output.object`), enforced with a JSON schema grammar
- ✅ Tool calling
- ✅ Vision and audio input with a multimodal projector (`projectorPath`)
- ✅ On-device inference (iOS & Android)
- ✅ Model download management
- ✅ GPU acceleration support

## Documentation

For complete installation instructions and API documentation, visit our [documentation site](https://react-native-ai.dev/docs/llama/getting-started).

## License

MIT

---

Made with ❤️ and [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
