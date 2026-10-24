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
