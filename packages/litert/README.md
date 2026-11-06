# LiteRT-LM Provider for Vercel AI SDK

A Vercel AI SDK provider for [LiteRT-LM](https://ai.google.dev/edge/litert-lm), Google's runtime for LLMs on the device. It runs `.litertlm` models on iOS and Android through [react-native-litert-lm](https://github.com/hung-yueh/react-native-litert-lm).

**Requirements:**
- react-native-litert-lm >= 0.8.2
- Vercel AI SDK v7

```ts
import { litert } from '@react-native-ai/litert'
import { generateText } from 'ai'

const model = litert('hf://litert-community/gemma-4-E2B-it-litert-lm')
await model.prepare()

const { text } = await generateText({
  model,
  prompt: 'Write a haiku about coding.',
})
```

## Features

- ✅ Text generation with `.litertlm` models from Hugging Face, a URL or a file
- ✅ Streaming
- ✅ Tool calling
- ✅ Structured output (`Output.object`), enforced by the engine
- ✅ Multi-turn conversations that continue in the engine, so the history isn't sent again
- ✅ Model download with progress
- ✅ GPU and CPU backends. NPU with a bundle compiled for the phone's chip, not yet verified on a device

## Documentation

For the complete guide, see the [LiteRT-LM documentation](https://react-native-ai.dev/docs/litert/getting-started).

## License

MIT
