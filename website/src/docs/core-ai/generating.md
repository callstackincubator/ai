# Generating

`coreAI.languageModel(config)` runs language models exported with the `coreai-models` LLM recipes, such as [Qwen3 0.6B](./models#hosted-exports), with `generateText` and `streamText`.

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

The model loads on the first call and stays loaded. Call `await model.prepare()` to load it ahead of time, and `await model.unload()` to release it.

Every call replays the whole message history into a new native session, so the AI SDK owns the conversation. To keep it inside the model's context window, see [Conversation History](../history).

## Structured Output

Pass a schema, and the model runs guided generation, so its output always matches it:

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

When streaming, the JSON arrives in one piece once it is complete. Models whose inference engine has no per-step logits cannot run guided generation, and reject with a `CORE_AI_UNSUPPORTED_CAPABILITY` error.

## Tool Calling

Function tools are passed to the model. A tool call ends the generation and comes back as a `tool-call` part, so the AI SDK runs the tool and replays its result on the next call. Set `stopWhen` to let the model answer with the result:

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

Core AI models decide themselves whether to call a tool, so a `required` or named `toolChoice` returns a warning and is treated as optional. A named tool is the only one offered. Provider-defined tools are left out with a warning.

## Image Prompts

Vision language model bundles (`kind: "vlm"` in their `metadata.json`), such as [Qwen3-VL 2B](./models#hosted-exports), answer prompts about an image. Pass the image as a file part of the last user message, from a `file://` URL or as base64:

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

- Apple's VLM engine answers one image and one prompt. It reads the first image and joins the text of the user turns, and ignores assistant replies, `system` and sampling settings (it decodes greedily). A prompt without an image is rejected, and so is structured output, with `CORE_AI_UNSUPPORTED_CAPABILITY`.
- Native sessions take text prompts only, so `createSession()` rejects vision language models. Use `generateText` or `streamText`.
- Other language models reject image prompts.
- The Qwen3-VL bundle is exported in the macOS format, which loads its weights on the GPU. On an iPhone it needs the [increased memory limit](./getting-started#memory-limit); without it, iOS stops the app while the model loads.

## Reasoning

The `reasoning` call option sets the model's thinking effort: `minimal` and `low` map to `light`, `medium` to `moderate`, and `high` and above to `deep`. `reasoning: 'none'` turns thinking off. `providerOptions['core-ai'].reasoningLevel` (`'none' | 'light' | 'moderate' | 'deep'`) takes precedence:

```typescript
const result = await generateText({
  model,
  prompt: 'What is 17 × 23?',
  providerOptions: { 'core-ai': { reasoningLevel: 'deep' } },
})

console.log(result.reasoningText)
```

Reasoning comes back as reasoning parts, and `usage` reports reasoning tokens.

## Settings

Core AI language models read `temperature` and `maxOutputTokens`. They ignore `topP`, `topK`, `seed`, `presencePenalty`, `frequencyPenalty` and `stopSequences`, and return a warning when those are set.

## Native Sessions

A native session keeps its transcript on the device, for apps that don't need the AI SDK to own the history:

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

`respond` resolves with the response parts, and `stream` emits the full response text so far with each update. Sessions end when the model unloads.
