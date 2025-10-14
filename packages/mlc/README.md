# MLC Provider for Vercel AI SDK

A Vercel AI SDK provider for MLC (Machine Learning Compilation) models, enabling on-device large language model inference in React Native applications.

**Requirements:**

- iOS 14+
- React Native New Architecture
- Vercel AI SDK v5

```ts
import { mlc } from '@react-native-ai/mlc'
import { generateText } from 'ai'

const answer = await generateText({
  model: mlc('Llama-3.2-3B-Instruct'),
  prompt: 'What is the meaning of life?'
})
```

## Features

- ✅ On-device text generation with MLC models
- ✅ Multiple model support (Llama, Phi, Qwen, etc.)
- ✅ Model downloading and management
- ✅ Streaming responses
- ✅ Hardware-accelerated inference

## Documentation

For complete installation instructions and API documentation, visit our [documentation site](https://react-native-ai.com/docs/mlc).

## License

MIT

---

Made with ❤️ and [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
