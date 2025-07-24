# Apple Provider for Vercel AI SDK

A Vercel AI SDK provider for Apple Foundation Models, enabling access to Apple Intelligence in React Native applications.

**Requirements:**
- iOS 26+
- Apple Intelligence enabled device
- Vercel AI SDK v5
- React Native New Architecture

```ts
import { apple } from '@react-native-ai/apple'
import { generateText } from 'ai'

const answer = await generateText({
  model: apple(),
  prompt: 'What is the meaning of life?'
})
```

## Features

- ✅ Text generation with Apple Foundation Models
- ✅ Structured outputs
- ✅ Tool calling
- ✅ Streaming

## Documentation

For complete installation instructions and API documentation, visit our [documentation site](https://react-native-ai.com/docs/apple).

## License

MIT

---

Made with ❤️ and [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
