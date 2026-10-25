# Generating

You can generate responses using ADK with the Vercel AI SDK's `generateText` or `streamText` functions. ADK runs the agent loop natively on Android, and the provider bridges tool execution and streaming back to JavaScript. The default `adk` provider targets on-device Gemini Nano.

## Requirements

- **Physical Android device with AICore** - Required for Gemini Nano. See [Getting Started - Availability](./getting-started.mdx#availability) for the runtime checks
- **Polyfills** - Streaming requires `ReadableStream`; see [Polyfills](../polyfills.md)

## Text Generation

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

const { text } = await generateText({
  model: adk(),
  prompt: 'Explain quantum computing in simple terms',
})
```

The first call prepares Gemini Nano. To prepare it ahead of time, call `model.prepare()` (see [Getting Started - Preparation](./getting-started.mdx#preparation)).

### Cloud Gemini

Cloud models use ADK's `LlmAgent` with the Gemini API. They are useful when Gemini Nano is unavailable, when you need a more capable model, or when you develop on an emulator without AICore. Create a provider with a Gemini API model id and an API key:

```typescript
import { createAdkProvider } from '@react-native-ai/adk'
import { generateText } from 'ai'

const adk = createAdkProvider({
  model: 'gemini-3.8-flash',
  apiKey: process.env.GOOGLE_API_KEY,
})

const { text } = await generateText({
  model: adk(),
  prompt: 'Explain quantum computing in simple terms',
})
```

> Do not embed API keys in production client apps. Prefer a backend proxy or secure runtime configuration.

## Streaming

Stream responses for real-time output:

```typescript
import { adk } from '@react-native-ai/adk'
import { streamText } from 'ai'

const { textStream } = streamText({
  model: adk(),
  prompt: 'Write a short story about a robot learning to paint',
})

for await (const delta of textStream) {
  console.log(delta)
}
```

The provider emits standard AI SDK stream parts: `text-*`, `reasoning-*`, `tool-*`, and `finish` with token usage. Pass an `abortSignal` to `generateText` or `streamText` to cancel the native run.

## Token Usage

ADK reports token usage as `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `cachedContentTokenCount` and `totalTokenCount`. The provider maps these to AI SDK `usage` on `generateText` results and on the streaming `finish` part:

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

const { usage } = await generateText({
  model: adk(),
  prompt: 'Count to five.',
})

console.log(usage.inputTokens) // promptTokenCount
console.log(usage.inputTokenDetails.cacheReadTokens) // cachedContentTokenCount
console.log(usage.outputTokens) // candidatesTokenCount + thoughtsTokenCount
console.log(usage.outputTokenDetails.reasoningTokens) // thoughtsTokenCount
console.log(usage.raw?.totalTokenCount)
```

## Reasoning

Set the AI SDK `reasoning` option to turn on the model's thinking. The thoughts come back as reasoning parts:

```typescript
import { createAdkProvider } from '@react-native-ai/adk'
import { generateText } from 'ai'

const adk = createAdkProvider({ model: 'gemini-3.8-flash', apiKey })

const { reasoningText, text } = await generateText({
  model: adk(),
  reasoning: 'medium',
  prompt: 'How many weekdays are there in March 2027?',
})
```

| `reasoning`                 | Cloud Gemini                     | Gemini Nano |
| --------------------------- | -------------------------------- | ----------- |
| `provider-default` or unset | The model's default              | Off         |
| `none`                      | Thinking budget `0`              | Off         |
| `minimal`, `low`, `medium`  | Budget of 512, 2048, 8192 tokens | On          |
| `high`, `xhigh`, `max`      | Budget of 24576 tokens           | On          |

Gemini Nano only supports thinking on or off, and only on devices whose AICore and model support it. Elsewhere the request still succeeds without thoughts. Some cloud models cannot turn thinking off, so `none` may fail for them.

To set an exact budget, or to hide the thoughts while the model still thinks, use `providerOptions.adk`:

```typescript
await generateText({
  model: adk(),
  prompt,
  providerOptions: {
    adk: { thinkingBudget: 4096, includeThoughts: false },
  },
})
```

## Tool Calling

ADK agents can call JavaScript tools during generation, on both Gemini Nano and cloud Gemini.

### ADK-Specific Behavior

ADK runs tools natively, which differs from other providers:

- **Register executors on the provider** - Pass tools to `createAdkProvider` via `availableTools` so ADK can call their `execute` handlers. A tool passed only to `generateText` or `streamText` is described to the model, but calling it returns an error to the model and the call result has a warning
- **Provider-executed** - Tool calls and their results are part of the result content, and tool calls are marked with `providerExecuted: true`
- **Native agent loop** - ADK runs the multi-step tool loop, so AI SDK `stopWhen` does not limit ADK's internal steps
- **Gemini Nano** - Gemini Nano has no native function calling. The provider lists the tools in the system instruction and converts the model's `tool_code` blocks into ADK function calls

### Setup

Register the tools on the provider with `availableTools`, and pass the same tools to the AI SDK:

```typescript
import { createAdkProvider } from '@react-native-ai/adk'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const getCurrentTime = tool({
  description: 'Get the current time for a city',
  inputSchema: z.object({
    city: z.string(),
  }),
  execute: async ({ city }) => ({
    city,
    time: new Date().toLocaleTimeString(),
  }),
})

const adk = createAdkProvider({
  availableTools: { getCurrentTime },
})

const { text, toolCalls, toolResults } = await generateText({
  model: adk(),
  tools: { getCurrentTime },
  prompt: 'What time is it in Warsaw?',
})
```

To change the executors later, call `updateTools` on the model:

```typescript
const model = adk()
model.updateTools({ getCurrentTime })
```

During streaming, the provider emits `tool-input-start`, `tool-input-delta`, `tool-input-end`, `tool-call` and `tool-result` stream parts as ADK runs the tools.

### Tool Approval

Set `needsApproval` on a tool to ask the user before ADK runs it. It takes `true` or a function of the tool input:

```typescript
import { createAdkProvider } from '@react-native-ai/adk'
import { streamText, tool } from 'ai'
import { z } from 'zod'

const deleteFile = tool({
  description: 'Delete a file',
  inputSchema: z.object({ path: z.string() }),
  needsApproval: async ({ path }) => !path.startsWith('tmp/'),
  execute: async ({ path }) => removeFile(path),
})

const adk = createAdkProvider({
  availableTools: { deleteFile },
})

const result = streamText({
  model: adk(),
  tools: { deleteFile },
  messages,
})
```

When ADK calls the tool, the provider checks `needsApproval` before running it:

1. If approval is needed, ADK waits and the step ends with the tool call and finish reason `tool-calls`. The AI SDK adds a `tool-approval-request` for the call
2. Send the user's answer as a `tool-approval-response` in the next call. With `useChat`, call `addToolApprovalResponse`. With `generateText` or `streamText`, append a tool message to the response messages:

```typescript
const messages = [
  ...previousMessages,
  ...(await result.response).messages,
  {
    role: 'tool',
    content: [
      {
        type: 'tool-approval-response',
        approvalId,
        approved: true,
        providerExecuted: true,
      },
    ],
  },
]
```

3. The next call continues the paused ADK run. An approved tool runs and ADK carries on. A denied tool returns an error with the denial reason to the model, and the AI SDK reports the call as denied

ADK-specific details:

- **Same tools on both sides** - The AI SDK creates the approval request from the tool passed to `generateText` or `streamText`, and the provider pauses ADK based on the tool in `availableTools`. Set `needsApproval` on both, which happens when you pass the same tool object. The call-level `toolApproval` option of `generateText` and `streamText` does not pause ADK
- **Paused runs live in memory** - The paused ADK run is not saved. Answering an approval after the app restarts throws a `TOOL_CALL_ERROR`, and sending a new message instead of answering cancels the paused run
- **The answering call continues the paused run** - Its new prompt and settings are not sent to ADK
- **`needsApproval` options** - The function gets the tool call id. `messages` is empty and `context` is `undefined`
- **`generateText`** - When a tool can need approval, the provider streams the native run and collects the result, so the call can return at the approval

### Tool Choice

| `toolChoice`            | Behavior                                                      |
| ----------------------- | ------------------------------------------------------------- |
| `auto` (default)        | The model decides                                             |
| `none`                  | No tools are sent to the model                                |
| `required`              | Sent as `auto`, with a warning - ADK cannot force a tool call |
| `{ type: 'tool', ... }` | Only that tool is sent, as `auto`, with a warning             |

## Image Prompts

Pass image file parts in user messages using the standard AI SDK prompt format. You can send several images in one message:

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

const { text } = await generateText({
  model: adk(),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this image?' },
        {
          type: 'file',
          mediaType: 'image/jpeg',
          data: base64Image,
        },
      ],
    },
  ],
})
```

Supported file data formats:

- **Base64 strings** - Raw base64 or `data:image/jpeg;base64,...` data URLs
- **`Uint8Array`** - Binary image data
- **`file://` and `content://` URLs** - Read natively, for example from an image picker
- **HTTP URLs** - Downloaded by the AI SDK before the call

## Structured Output

Generate objects that match a schema with `Output.object()`:

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText, Output } from 'ai'
import { z } from 'zod'

const { output } = await generateText({
  model: adk(),
  output: Output.object({
    schema: z.object({ name: z.string(), age: z.number() }),
  }),
  prompt: 'Invent a character.',
})
```

Structured output also works with `streamText` and `Output.json()`.

- **Cloud Gemini** - The schema is converted to a Gemini response schema, so the model can only produce matching JSON. Keywords that Gemini does not support, such as `$ref`, are dropped
- **Gemini Nano** - ML Kit has no runtime schema API, so the provider puts the schema in the system instruction and strips Markdown code fences from the reply. The AI SDK validates the result, so check for `NoObjectGeneratedError`

## Available Options

Configure model behavior with generation options:

| Option             | Type     | Description                    | Gemini Nano |
| ------------------ | -------- | ------------------------------ | ----------- |
| `temperature`      | number   | Controls randomness            | Yes         |
| `maxOutputTokens`  | number   | Maximum tokens to generate     | Yes         |
| `topK`             | number   | Top-K sampling parameter       | Yes         |
| `seed`             | number   | Seed for repeatable sampling   | No          |
| `topP`             | number   | Nucleus sampling threshold     | No          |
| `stopSequences`    | string[] | Stop generating at these texts | No          |
| `presencePenalty`  | number   | Penalize repeated topics       | No          |
| `frequencyPenalty` | number   | Penalize repeated tokens       | No          |

Settings that Gemini Nano does not support are ignored with an AI SDK warning.

Example:

```typescript
import { adk } from '@react-native-ai/adk'
import { generateText } from 'ai'

const { text } = await generateText({
  model: adk(),
  prompt: 'Write a creative story',
  temperature: 0.8,
  maxOutputTokens: 500,
  topK: 40,
})
```

## Limitations

| Feature                     | Status                                                      |
| --------------------------- | ----------------------------------------------------------- |
| Native tool calling on Nano | Not in ML Kit - the provider parses `tool_code` blocks      |
| Forcing a tool call         | `required` and specific tools run as `auto`, with a warning |
| Tool approval               | Paused runs live in memory, `toolApproval` does not pause   |
| Schema enforcement on Nano  | Prompted, then validated by the AI SDK                      |
| Provider file references    | Throws - pass data or a URL                                 |
| iOS / web                   | Android only                                                |
