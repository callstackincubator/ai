---
title: "Generating"
---

Generate text with a GGUF model: pass a llama language model to the AI
SDK's `generateText` or `streamText`. The examples start from a prepared model,
as in [Getting Started](/docs/llama/getting-started#usage):

```typescript
import { downloadModel, llama } from '@react-native-ai/llama'

const modelPath = await downloadModel(
  'bartowski/Qwen_Qwen3.5-2B-GGUF/Qwen_Qwen3.5-2B-Q4_K_M.gguf'
)
const model = llama.languageModel(modelPath)
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

The standard AI SDK generation options are passed to llama.rn:

```typescript
const result = await generateText({
  model,
  prompt: 'Write a creative story',
  temperature: 0.8,
  maxOutputTokens: 500,
  topP: 0.9,
  topK: 40,
  presencePenalty: 0.5,
  frequencyPenalty: 0.5,
  stopSequences: ['THE END'],
  seed: 42,
})
```

`providerOptions.llama` passes any other llama.rn completion parameter, such as
`min_p` or `penalty_repeat`, and takes precedence over the options above.

## Tool Calling

Pass tools as usual. The AI SDK runs them and sends the results back to the
model:

```typescript
import { generateText, tool } from 'ai'
import { z } from 'zod'

const result = await generateText({
  model,
  prompt: 'What is the weather in Paris?',
  tools: {
    getWeather: tool({
      description: 'Get current weather information',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => `Weather in ${city}: Sunny, 25°C`,
    }),
  },
})
```

Tool calling depends on the model's chat template, so use a model trained for
it, such as Qwen3.5 or Gemma 4.

## Structured Output

Generate JSON that matches a schema with `Output.object`. The schema is
compiled into a grammar, so the model can only produce valid JSON:

```typescript
import { generateText, Output } from 'ai'
import { z } from 'zod'

const { output } = await generateText({
  model,
  output: Output.object({
    schema: z.object({
      name: z.string(),
      age: z.number(),
      hobbies: z.array(z.string()),
    }),
  }),
  prompt: 'Generate a fictional person profile',
})

console.log(output)
// { name: 'Alice', age: 28, hobbies: ['reading', 'hiking'] }
```

Thinking is turned off for structured output, since llama.rn cannot combine a
grammar with it, and an explicit `reasoning` level returns an `unsupported`
warning.

## Reasoning

Reasoning models, such as Qwen3.5, Gemma 4, and DeepSeek-R1, return their
thinking separately from the answer:

```typescript
const result = await generateText({
  model,
  prompt: 'Solve this math problem step by step: 2x + 5 = 13',
})

console.log(result.text) // the answer
console.log(result.reasoningText) // the thinking, if the model produced any
```

When streaming, reasoning is emitted as `reasoning-start`, `reasoning-delta`
and `reasoning-end` parts.

Use the AI SDK `reasoning` option to control how much the model thinks:

| `reasoning`                    | Effect                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `'provider-default'` (default) | The chat template decides, most reasoning models think                                                                                                       |
| `'none'`                       | Thinking is turned off (`enable_thinking: false`)                                                                                                            |
| `'minimal'` to `'max'`         | Thinking is on, capped at a token budget: 2% to 95% of `maxOutputTokens`, or of the context size when `maxOutputTokens` is not set, and at least 1024 tokens |

```typescript
const result = await generateText({
  model,
  prompt: 'What is the capital of France?',
  reasoning: 'none',
})
```

To set llama.rn's `enable_thinking` or `thinking_budget_tokens` directly, pass
them in `providerOptions.llama`, which takes precedence.

## Images and Audio

Multimodal models take images and, for some models, audio. They ship as two
files: the model and a multimodal projector (`mmproj`). Download both and pass
the projector as `projectorPath`:

```typescript
import { downloadModel, llama } from '@react-native-ai/llama'
import { generateText } from 'ai'

// Gemma 4 E2B reads images and audio, and supports reasoning and tool calling
const modelPath = await downloadModel(
  'ggml-org/gemma-4-E2B-it-GGUF/gemma-4-E2B-it-Q4_0.gguf'
)
const projectorPath = await downloadModel(
  'ggml-org/gemma-4-E2B-it-GGUF/mmproj-gemma-4-E2B-it-Q8_0.gguf'
)

const model = llama.languageModel(modelPath, { projectorPath })
await model.prepare()

const result = await generateText({
  model,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What do you see in this image?' },
        { type: 'image', image: new URL('file:///path/to/image.jpg') },
      ],
    },
  ],
})
```

Images can also be a `Uint8Array` or a base64 string with a `mediaType`. Audio
goes in a `file` part:

```typescript
{ type: 'file', mediaType: 'audio/wav', data: new URL('file:///path/to/clip.wav') }
```

- **Formats.** Images can be JPEG, PNG, BMP, GIF, TGA, HDR, PIC, or PNM, and
  audio WAV or MP3. Other files, such as PDFs, throw
  `UnsupportedFunctionalityError`.
- **Sources.** Local `file://` URLs and in-memory data are read on device.
  The AI SDK downloads remote `http(s)` URLs before the call.
- **Context.** Multimodal models default to a 4096-token context, and a large
  image can take a quarter of it. See `projectorImageMaxTokens` in the
  [model options](/docs/llama/model-management#llamalanguagemodelmodelpath-options).

## Long Conversations

The whole chat must fit in the context, 2048 tokens by default. Raise `n_ctx`
in the [model options](/docs/llama/model-management#llamalanguagemodelmodelpath-options),
or wrap the model with `wrapLanguageModelWithHistory` to keep a rolling window
and summarize older messages. See [Conversation History](/docs/history).
