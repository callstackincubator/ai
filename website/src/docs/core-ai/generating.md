# Generating

`coreAI.languageModel(config)` runs language models exported with the `coreai-models` LLM recipes, such as [Qwen3 0.6B](./models#hosted-exports), with `generateText` and `streamText`.

```typescript
import { coreAI } from '@react-native-ai/core-ai'
import { generateText, streamText } from 'ai'

const model = coreAI.languageModel({
  id: 'qwen3-0.6b',
  source: { type: 'file', uri: qwen3ModelDirectory },
  variant: 'iOS',
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

`variant` is the platform the model was exported for (`iOS` or `macOS`). The model loads on the first call and stays loaded. Call `await model.prepare()` to load it ahead of time, and `await model.unload()` to release it.

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
