[![image](https://github.com/user-attachments/assets/027ccbc1-c6c4-46a0-aa62-7b89d4e62f24)](https://www.callstack.com/open-source?utm_campaign=generic&utm_source=github&utm_medium=referral&utm_content=react-native-ai)

# React Native AI

**On-device AI for React Native, built on the [Vercel AI SDK](https://ai-sdk.dev).**

React Native AI is a set of packages that run AI models on your users' phones.
Each provider package wraps one on-device runtime, such as Apple Intelligence
on iOS, Gemini Nano on Android or llama.cpp on both, and exposes it as an AI
SDK provider.

## Providers

Providers come in two kinds: built-in models that ship with the operating
system, and custom models that your app downloads or bundles.

**Built-in models**

| Provider                                  | Package                                          | Platform | Models                                                                                                |
| ----------------------------------------- | ------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------- |
| [Apple Intelligence](#apple-intelligence) | [`@react-native-ai/apple`](./packages/apple-llm) | iOS      | Foundation Models on-device and on Private Cloud Compute, system embeddings, transcription and speech |
| [Google ADK](#google-adk)                 | [`@react-native-ai/adk`](./packages/adk)         | Android  | Gemini Nano on-device, optional cloud Gemini                                                          |

**Custom models**

| Provider                           | Package                                          | Platform     | Models                                            |
| ---------------------------------- | ------------------------------------------------ | ------------ | ------------------------------------------------- |
| [Llama](#llama)                    | [`@react-native-ai/llama`](./packages/llama)     | iOS, Android | llama.cpp-compatible GGUF models                  |
| [Core AI](#core-ai) (not released) | [`@react-native-ai/core-ai`](./packages/core-ai) | iOS 27+      | Model bundles exported with `apple/coreai-models` |

> [!TIP]
> **Llama or Core AI?** Use Llama to run the same model on iOS and Android, or
> a GGUF model from Hugging Face. Use Core AI when your app targets iOS 27+ and
> you want Apple's own runtime, or need what Llama doesn't cover: image and
> video generation, and vision tasks such as segmentation and object detection.

### Apple Intelligence

Use the models built into iOS: Foundation Models for text generation, on-device
or on Private Cloud Compute, plus system models for embeddings, transcription
and speech. Your app has nothing to bundle.

```bash
npm install @react-native-ai/apple ai
```

```ts
import { apple } from '@react-native-ai/apple'
import { generateText } from 'ai'

const { text } = await generateText({
  model: apple(),
  prompt: 'Explain quantum computing',
})
```

[Package README](./packages/apple-llm) · [Documentation](https://react-native-ai.dev/docs/apple/getting-started)

### Google ADK

Use Gemini on Android through Google's
[Agent Development Kit](https://developer.android.com/ai/adk). Gemini Nano runs
on-device and is provided by the system through AICore, so there are no model
files and no API key. Cloud Gemini is available when you need a larger model.

```bash
npm install @react-native-ai/adk ai
```

```ts
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

const { text } = await generateText({
  model: adk(),
  prompt: 'Explain quantum computing',
})
```

[Package README](./packages/adk) · [Documentation](https://react-native-ai.dev/docs/adk/getting-started)

### Llama

Run llama.cpp-compatible GGUF models from Hugging Face on iOS and Android with
[llama.rn](https://github.com/mybigday/llama.rn). Supports text generation,
embeddings, reranking and speech.

```bash
npm install @react-native-ai/llama llama.rn react-native-blob-util ai
```

```ts
import { downloadModel, llama } from '@react-native-ai/llama'
import { generateText } from 'ai'

// Model ID format: "owner/repo/filename.gguf"
const modelPath = await downloadModel(
  'bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf'
)

const model = llama.languageModel(modelPath)
await model.prepare()

const { text } = await generateText({
  model,
  prompt: 'Write a haiku about coding.',
})

// Release the native context when you no longer need the model
await model.unload()
```

[Package README](./packages/llama) · [Documentation](https://react-native-ai.dev/docs/llama/getting-started)

### Core AI

Not published to npm yet. Run models exported with
[`apple/coreai-models`](https://github.com/apple/coreai-models), such as Qwen3
or FLUX.2, on iOS 27 with Apple's Core AI framework. Every task has a
[hosted export](https://react-native-ai.dev/docs/core-ai/models) to start
from: text, image and video generation, transcription, embeddings, and vision
tasks such as segmentation and object detection.

```ts
import { coreAI } from '@react-native-ai/core-ai'
import { streamText } from 'ai'

const result = streamText({
  // A model folder shipped in the app bundle, or a path in app storage
  model: coreAI.languageModel({ source: 'bundle://models/qwen3-0.6b' }),
  prompt: 'Explain Core AI in one sentence.',
})
```

[Package README](./packages/core-ai) · [Documentation](https://react-native-ai.dev/docs/core-ai/getting-started)

## Tools

These work with any AI SDK provider, on-device or cloud.

| Package                                              | Description                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| [`@react-native-ai/json-ui`](./packages/json-ui)     | Let a tool-calling model build React Native UI from a JSON spec           |
| [`@react-native-ai/dev-tools`](./packages/dev-tools) | Inspect AI SDK calls in Rozenite DevTools                                 |
| [`@react-native-ai/utils`](./packages/utils)         | Compact conversation history for small context windows (not released yet) |

## AI SDK Compatibility

| React Native AI | AI SDK |
| --------------- | ------ |
| 0.11 and below  | v5     |
| 0.12            | v6     |
| 0.13 and above  | v7     |

## Documentation

Guides and API reference are available at [react-native-ai.dev](https://react-native-ai.dev).

## Contributing

Read the [contribution guidelines](/CONTRIBUTING.md) before contributing.

## Agent skills

This repository provides agent skills to help you integrate and use the packages. You can easily install them with:

`npx skills add https://github.com/callstackincubator/react-native-ai --skill react-native-ai-skills`

or manually by copying the `skills/` directory into your agent's skills directory (for example `.cursor/skills/`).

## Made with ❤️ at Callstack

**react-native-ai** is an open source project and will always remain free to use. If you think it's cool, please star it 🌟.

[Callstack][callstack-readme-with-love] is a group of React and React Native geeks, contact us at [hello@callstack.com](mailto:hello@callstack.com) if you need any help with these or just want to say hi!

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)

[callstack-readme-with-love]: https://callstack.com/?utm_source=github.com&utm_medium=referral&utm_campaign=react-native-ai&utm_term=readme-with-love
