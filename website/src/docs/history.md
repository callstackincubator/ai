# Conversation History

On-device models have small context windows. Apple Foundation Models has 4096
tokens on iOS 26, and llama.rn models default to 2048. The AI SDK sends the
whole message list with every request, so a long chat eventually stops fitting.

`wrapLanguageModelWithHistory` from `@react-native-ai/utils` wraps any AI SDK
language model and compacts the prompt before each request. It can keep a
rolling window of recent messages, fold older messages into a summary, and drop
tool calls of earlier turns. Your chat state is not changed: only the prompt
sent to the model is.

:::warning Not published to npm
`@react-native-ai/utils` is not on npm yet. Until it is, use it from this
monorepo the way the example app does, or copy
[`packages/utils/src/index.ts`](https://github.com/callstackincubator/ai/blob/main/packages/utils/src/index.ts)
into your app. Its only dependency is `@ai-sdk/provider`.
:::

## Usage

```typescript
import { apple } from '@react-native-ai/apple'
import { wrapLanguageModelWithHistory } from '@react-native-ai/utils'
import { streamText } from 'ai'

const model = apple()
const { contextSize = 4096 } = await apple.getModelInfo()

const modelWithHistory = wrapLanguageModelWithHistory(model, {
  rollingWindowMessages: 12,
  summarizeHistory: {
    model,
    threshold: Math.floor(contextSize * 0.6),
  },
  dropCompletedToolCalls: true,
})

const result = streamText({
  model: modelWithHistory,
  messages,
})
```

Each option works on its own, and you can combine them. They run in the order
below.

## Options

### `dropCompletedToolCalls`

Removes tool calls and tool results from turns before the latest user message.
Assistant text from those turns is kept. Tool steps of the turn being answered
are never touched, so multi-step tool calling keeps working.

### `rollingWindowMessages`

Keeps system messages and the last N other messages. The window never cuts
into the turn being answered: when the latest user message and its tool steps
are longer than N messages, all of them are kept. The window also never starts
with a tool result whose tool call fell outside it.

Without `summarizeHistory`, messages outside the window are dropped. With it,
they are summarized.

### `summarizeHistory`

- `model`: the model that writes the summary. It can be the model you are
  wrapping or a different one. Pass the unwrapped model.
- `threshold`: prompt size in tokens. When the prompt left after the rolling
  window is larger, everything before the latest user message is summarized
  too.

The summary is added to the end of the last system message, or sent as a new
system message when there is none:

```text
Summary of earlier conversation:
...
```

Summaries are built incrementally. The wrapper remembers the last summary for
each summarizer model and reuses it while the summarized messages are still the
start of the history:

- Tool steps within one turn reuse the summary without calling the model.
- The next turn summarizes only the messages that left the window since,
  together with the existing summary.
- If earlier messages change, for example after editing a message or switching
  to another chat, the summary is rebuilt from scratch.

Summarizing a long history at once could overflow the summarizer's own
context, so messages are folded in chunks that fit the threshold. Each summary
is capped at 400 output tokens.

The summarizer call receives the request's `abortSignal`. If it throws, the
request fails with that error. If it returns no text, older messages are dropped
without a summary.

## Choosing a threshold

The threshold is compared to a token count of the system messages and
conversation. Models with a `countTokens` method count with their own
tokenizer, which Apple and llama.rn language models have. Other models use an
estimate of four characters per token.

The count does not include tool definitions, structured output schemas, or the
summary itself, and the model still needs room for its answer. Start at about
60% of the context size:

- Apple: `contextSize` from `apple.getModelInfo()`. Token counting needs iOS
  26.4, and older versions fall back to the estimate.
- llama.rn: the `n_ctx` you pass in `contextParams`.
- Other providers: the context size of the model you load.

If the latest user message and its tool steps alone exceed the threshold, they
are sent as they are.

## Costs

Summarizing is an extra model call that runs before the request. On device it
adds latency to the turns that summarize. A rolling window with `summarizeHistory` summarizes on most
turns once the chat is longer than the window. `summarizeHistory` alone only
summarizes once the prompt passes the threshold.

Summaries lose detail. Keep the window large enough for the recent context the
model needs word for word.

## Lower-level helpers

- `applyHistoryManagement(prompt, options, abortSignal?)` returns the compacted
  prompt without wrapping a model.
- `trimMessagesForHistory(prompt, options)` applies `dropCompletedToolCalls` and
  `rollingWindowMessages` synchronously, without summarizing.

Both take an AI SDK `LanguageModelV4Prompt`, the format providers receive.
