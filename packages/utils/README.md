# React Native AI Utils

Shared utilities for React Native AI SDK providers.

> Not published to npm yet. Use it from this monorepo, or copy
> `src/index.ts` into your app. Its only dependency is `@ai-sdk/provider`.

## Conversation history

`wrapLanguageModelWithHistory` wraps an AI SDK language model and compacts the
prompt before each request, so long chats fit small on-device context windows.

```ts
import { wrapLanguageModelWithHistory } from '@react-native-ai/utils'

const modelWithHistory = wrapLanguageModelWithHistory(model, {
  rollingWindowMessages: 12,
  summarizeHistory: {
    threshold: 2500,
    model,
  },
  dropCompletedToolCalls: true,
})
```

The options run in this order:

- `dropCompletedToolCalls` removes tool calls and tool results of turns before
  the latest user message, keeping their assistant text.
- `rollingWindowMessages` keeps system messages and the last N other messages.
  The latest user turn is always kept whole, and the window never starts with
  an orphaned tool result.
- `summarizeHistory` summarizes the messages the window leaves out instead of
  dropping them. When the remaining prompt is over `threshold` tokens,
  everything before the latest user message is summarized too. The summary is
  added to the system message.

Summaries are built incrementally and cached per summarizer model, so each new
turn summarizes only the messages that changed. Long histories are summarized
in chunks that fit the threshold.

`summarizeHistory` counts prompt tokens with the summarizer model's
`countTokens` method when it has one (Apple and llama.rn language models do).
Other models fall back to an estimate of four characters per token.

See the [Conversation History docs](https://react-native-ai.dev/docs/history)
for how to choose a threshold and what it costs.
