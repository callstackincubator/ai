---
title: "Generating"
---

Generate text with a `.litertlm` model: pass a LiteRT language model to the AI
SDK's `generateText` or `streamText`. The examples start from a prepared model,
as in [Getting Started](/docs/litert/getting-started#usage):

```typescript
import { litert } from '@react-native-ai/litert'

const model = litert('hf://litert-community/gemma-4-E2B-it-litert-lm')
await model.prepare()
```

## Text Generation

```typescript
import { generateText } from 'ai'

const result = await generateText({
  model,
  prompt: 'Explain quantum computing in simple terms',
})

console.log(result.text)
```

## Streaming

```typescript
import { streamText } from 'ai'

const { textStream } = streamText({
  model,
  prompt: 'Write a short story about a robot learning to paint',
})

for await (const delta of textStream) {
  console.log(delta)
}
```

## Options

Sampling and tools apply when a LiteRT-LM model loads. The provider honors them
by reloading the model when they change, and the call carries a warning, so keep
them the same from call to call.

| Option                                | Applies                              |
| ------------------------------------- | ------------------------------------ |
| `maxOutputTokens`                     | Per call, 1024 if not set            |
| `temperature`, `topK`, `topP`         | Reload when changed                  |
| `tools`                               | Reload when changed                  |
| `output: Output.object(...)`          | Reload when turned on or off         |
| `reasoning`                           | Per call, off by default             |
| `frequencyPenalty`, `presencePenalty` | Per call                             |
| `seed`, `stopSequences`               | Not supported, a warning             |

To set sampling once, pass it with the model, as in
[Getting Started](/docs/litert/getting-started#options). That doesn't reload.

A reply that stops at `maxOutputTokens` reports `finishReason: 'length'`.

Images and audio in the prompt aren't supported yet: a file part fails with a
clear error.

## Tool Calling

Pass tools as usual. The AI SDK runs them and sends the results back to the
model:

```typescript
import { generateText, stepCountIs, tool } from 'ai'
import { z } from 'zod'

const result = await generateText({
  model,
  prompt: 'What is the weather in Tokyo?',
  tools: {
    getWeather: tool({
      description: 'Get current weather information',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => `Weather in ${city}: Sunny, 25°C`,
    }),
  },
  stopWhen: stepCountIs(3),
})
```

A tool call that doesn't parse, or that fails its schema, arrives as a
`tool-error` part, so the model can try again on the next step. The engine can't
force a call: `toolChoice: 'required'` gives a warning and the model decides.

## Structured Output

Generate JSON that matches a schema with `Output.object`. The engine constrains
the output to the schema:

```typescript
import { generateText, Output } from 'ai'
import { z } from 'zod'

const { output } = await generateText({
  model,
  output: Output.object({
    schema: z.object({
      capital: z.string(),
      country: z.string(),
    }),
  }),
  prompt: 'Name the capital of Japan and its country.',
})
```

A model held to a schema can't call a tool. So a call that also has tools sends the
schema to the model as an instruction instead. `Output.json()` has no schema, so
it's an instruction too. An instruction comes with a warning on the call, and a reply that
doesn't match fails the way it does with any provider.

## Reasoning

react-native-litert-lm doesn't hand a model's thoughts to JavaScript, so the
provider turns thinking off unless a call sets `reasoning`. Otherwise a model that
thinks by default would spend `maxOutputTokens` on text nobody can read.

With `reasoning: 'high'`, the model thinks, `reasoningText` stays empty, and the
thoughts count against `maxOutputTokens`, so leave room: on a Pixel 11 Pro,
Qwen3-0.6B returned empty text for 17 × 23 with 512 tokens. A call that ends with
no text this way reports `finishReason: 'length'`.

`<think>` tags that a bundle leaves at the start of its text become reasoning parts.
After the answer has begun, a tag is text.

## Conversations

Replaying a whole conversation for every message gets slow as the chat grows. The
provider keeps the conversation in the engine, and when a call's messages extend
what the engine already holds, it sends only the new message. Send the messages
back as `response.messages` gave them:

```typescript
import { generateText, type ModelMessage } from 'ai'

const messages: ModelMessage[] = [{ role: 'user', content: 'Hello' }]
const first = await generateText({ model, messages })

messages.push(...first.response.messages, { role: 'user', content: 'And then?' })
const second = await generateText({ model, messages })
```

`providerMetadata.litert.continued` tells you whether a call did this. A different
history replays, which is always correct and only slower.
