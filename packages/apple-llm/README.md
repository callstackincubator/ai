# Apple LLM

Use Apple's local LLM functionality (Apple Intelligence) in React Native, with Vercel AI SDK.

```ts
import { apple } from '@react-native-ai/apple'
import { generateText } from 'ai'

await generateText({
  model: apple(),
  prompt: 'What is the meaning of life?'
})
```

## Features

### Supported
- Text generation
- Structured output
- Tool calling

### Cooming soon
- Streaming

## Read more 

For installation instructions and comprehensive documentation, visit [callstack.com](callstack.com).

## License

MIT

---

Made with ❤️ and [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
