---
title: "Generating"
---

Generate text with a language model you ship, such as the [hosted Qwen3 0.6B](/docs/core-ai/models#hosted-exports): pass `coreAI.languageModel(config)` to the AI SDK's `generateText` or `streamText`.

```typescript
import { coreAI } from '@react-native-ai/core-ai'
import { generateText, streamText } from 'ai'

const model = coreAI.languageModel({
  id: 'qwen3-0.6b',
  source: qwen3ModelDirectory,
})

const { text } = await generateText({
  model,
  system: 'Answer in one sentence.',
  prompt: 'What is on-device AI?',
})

const result = streamText({ model, prompt: 'Write a haiku about the sea.' })
for await (const delta of result.textStream) {
  console.log(delta)
}
```

The model loads on the first call and stays loaded. Call `model.prepare()` to load it ahead of time, and `model.unload()` to free the memory.

Each call sends the whole conversation, as with any AI SDK model. To keep long chats within the context window, see [Conversation History](/docs/history).

## Structured Output

Get a typed object back instead of free text. The model is constrained to the schema, so its output always matches it:

```typescript
import { generateText, Output } from 'ai'
import { z } from 'zod'

const { output } = await generateText({
  model,
  output: Output.object({
    schema: z.object({ word: z.string(), translation: z.string() }),
  }),
  prompt: 'Create a vocabulary card for "flower" in Spanish.',
})
```

When streaming, the object arrives in one piece once it is complete. A few model types can't constrain their output and reject with `CORE_AI_UNSUPPORTED_CAPABILITY`.

## Tool Calling

Let the model call your JavaScript functions, for example to look something up in your app. The AI SDK runs the tool and sends the result back, so set `stopWhen` to give the model a step to answer with it:

```typescript
import { generateText, stepCountIs, tool } from 'ai'
import { z } from 'zod'

const { text } = await generateText({
  model,
  prompt: 'What is the weather in Paris?',
  tools: {
    getWeather: tool({
      description: 'Gets the weather in a city',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, temperature: 21 }),
    }),
  },
  stopWhen: stepCountIs(3),
})
```

The model always decides whether to call a tool: a `required` or named `toolChoice` is treated as optional, with a warning. Provider-defined tools aren't supported.

## Image Prompts

Ask questions about a photo with a vision language model, such as the [hosted Qwen3-VL 2B](/docs/core-ai/models#hosted-exports). Pass the image as a file part of the last user message, from a `file://` URL or as base64:

```typescript
const vision = coreAI.languageModel({
  id: 'qwen3-vl-2b',
  source: qwen3VLModelDirectory,
})

const { text } = await generateText({
  model: vision,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          mediaType: 'image/jpeg',
          data: new URL(`file://${imagePath}`),
        },
        { type: 'text', text: 'What animals are in this picture?' },
      ],
    },
  ],
})
```

- Each call answers one image and one prompt. Earlier replies, `system`, sampling settings and structured output aren't supported, and a prompt without an image is rejected.
- Vision models don't work with [native sessions](#native-sessions).
- On an iPhone, Qwen3-VL needs the [increased memory limit](/docs/core-ai/getting-started#memory-limit), or iOS stops the app while the model loads.

## Reasoning

Let the model think before it answers, for harder questions. Set the effort with the AI SDK's `reasoning` option, or with Core AI's own levels in `providerOptions['core-ai'].reasoningLevel` (`'none' | 'light' | 'moderate' | 'deep'`):

```typescript
const result = await generateText({
  model,
  prompt: 'What is 17 × 23?',
  providerOptions: { 'core-ai': { reasoningLevel: 'deep' } },
})

console.log(result.reasoningText)
```

`reasoning: 'none'` turns thinking off. `minimal` and `low` map to `light`, `medium` to `moderate`, and anything higher to `deep`. `usage` counts reasoning tokens.

## Settings

Core AI language models support `temperature` and `maxOutputTokens`. Other sampling settings are ignored with a warning.

## Native Sessions

If you don't need the AI SDK to manage the conversation, a native session keeps it on the device instead:

```typescript
const session = await model.createSession({
  instructions: 'Answer in one short paragraph.',
})

const parts = await session.respond('What is on-device AI?')

const stream = await session.stream('And why does it matter?')
for await (const update of stream) {
  console.log(update.content)
}

await session.close()
```

Each `stream` update holds the whole response so far. Sessions end when the model unloads.
