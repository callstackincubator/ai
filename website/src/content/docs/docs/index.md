---
title: "Introduction"
---

React Native AI runs AI models on your users' devices, through the Vercel AI
SDK. Each provider uses the models its platform offers, or ones you ship, so
you can swap the model per platform and keep the rest of your code.

```typescript
import { apple } from '@react-native-ai/apple'
import { streamText } from 'ai'

const result = streamText({
  model: apple(),
  prompt: 'Plan a 3-day trip to Kyoto',
})
```

## Why On Device

- **Private.** Prompts and replies stay on the device. Cloud models are opt-in.
- **Offline.** No network round trip, and it works in airplane mode.
- **No server costs.** No API keys for system models, and no per-token bills.

## Providers

| Provider                                       | Platform        | Models                                                 | Runtime                                    |
| ---------------------------------------------- | --------------- | ------------------------------------------------------ | ------------------------------------------ |
| [Apple](/docs/apple/getting-started)           | iOS             | Built in: Apple Intelligence, speech and embeddings    | Native, provided by the platform           |
| [Core AI](/docs/core-ai/getting-started)       | iOS 27          | Yours: language, image, speech and vision models       | Native, provided by the platform           |
| [ADK](/docs/adk/getting-started)               | Android         | Built in: Gemini Nano, or cloud Gemini                 | Native, provided by the platform           |
| [Llama](/docs/llama/getting-started)           | iOS and Android | Yours: GGUF models from Hugging Face                   | Third-party binding, llama.rn              |

Built-in models need no download and work on supported devices right away.
With Core AI and Llama, your app downloads or bundles the models, and we point
you to ready-to-use ones.

Every provider needs the AI SDK's [polyfills](/docs/polyfills).

## Tools

- [Conversation History](/docs/history) keeps long chats within the small
  context windows of on-device models.
- [DevTools](/docs/dev-tools) shows every AI SDK call as a trace in Rozenite,
  for on-device and remote models alike.
- [JSON UI](/docs/json-ui/getting-started) builds React Native views from tool
  calls, and is designed for small models. It's experimental.
