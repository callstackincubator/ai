# React Native AI Utils

Shared utilities for React Native AI SDK providers.

```ts
import { wrapLanguageModelWithHistory } from '@react-native-ai/utils'

const modelWithHistory = wrapLanguageModelWithHistory(model, {
  summarizeHistory: {
    threshold: 5000,
    model,
  },
  rollingWindowMessages: 12,
  dropCompletedToolCalls: true,
})
```

`summarizeHistory` counts prompt tokens with the summarizer model's
`countTokens` method when it has one (Apple and llama.rn language models do).
Other models fall back to an estimate of four characters per token.
