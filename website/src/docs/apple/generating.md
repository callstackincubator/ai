# Generating

You can generate response using Apple Foundation Models with the Vercel AI SDK's `generateText` or `generateObject` function.

## Requirements

- **iOS 26+** - Apple Foundation Models is available in iOS 26 or later
- **Apple Intelligence enabled device** - Device must support Apple Intelligence

## Text Generation

```typescript
import { apple } from '@react-native-ai/apple';
import { generateText } from 'ai';

const result = await generateText({
  model: apple(),
  prompt: 'Explain quantum computing in simple terms'
});
```

## Streaming

```typescript
import { streamText } from 'ai';
import { apple } from '@react-native-ai/apple';

const { textStream } = await streamText({
  model: apple(),
  prompt: 'Write me a short essay on the meaning of life'
});

for await (const delta of textStream) {
  console.log(delta);
}
```

> [!NOTE]
> Streaming objects is currently not supported.

## Structured Output

Generate structured data that conforms to a specific schema:

```typescript
import { generateObject } from 'ai';
import { apple } from '@react-native-ai/apple';
import { z } from 'zod';

const schema = z.object({
  name: z.string(),
  age: z.number().int().min(0).max(150),
  email: z.string().email(),
  occupation: z.string()
});

const result = await generateObject({
  model: apple(),
  prompt: 'Generate a user profile for a software developer',
  schema
});

console.log(result.object);
// { name: string, age: number, email: string, occupation: string }
```

## Tool Calling

Enable Apple Foundation Models to use custom tools in your React Native applications.

### Important Apple-Specific Behavior

Tools are executed by Apple, not the Vercel AI SDK, which means:

- **No AI SDK callbacks**: `maxSteps`, `onStepStart`, and `onStepFinish` will not be executed
- **Pre-register all tools**: You must pass all tools to `createAppleProvider` upfront
- **Empty toolCallId**: Apple doesn't provide tool call IDs, so they will be empty strings

### Setup

All tools must be registered ahead of time with Apple provider. To do so, you must create one by calling `createAppleProvider`:

```typescript
import { createAppleProvider } from '@react-native-ai/apple';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const getWeather = tool({
  description: 'Get current weather information',
  inputSchema: z.object({
    city: z.string()
  }),
  execute: async ({ city }) => {
    return `Weather in ${city}: Sunny, 25°C`;
  }
});

const apple = createAppleProvider({
  availableTools: {
    getWeather
  }
});
```

If you want to change the tools at runtime, you can do it as follows:

```typescript
const apple = createAppleProvider({
  availableTools: {
    getWeather
  }
});
const model = apple();

model.updateTools({
  getWeather,
  getDate
});
```

### Basic Tool Usage

Then, generate output like with any other Vercel AI SDK provider:

```typescript
const result = await generateText({
  model: apple(),
  prompt: 'What is the weather in Paris?',
  tools: {
    getWeather
  }
});
```

### Inspecting Tool Calls

You can inspect tool calls and their results after generation:

```typescript
const result = await generateText({
  model: apple(),
  prompt: 'What is the weather in Paris?',
  tools: { getWeather }
});

// Inspect tool calls made during generation
console.log(result.toolCalls);
// Example: [{ toolCallId: '<< redacted >>', toolName: 'getWeather', input: '{"city":"Paris"}' }]

// Inspect tool results returned
console.log(result.toolResults);  
// Example: [{ toolCallId: '<< redacted >>', toolName: 'getWeather', result: 'Weather in Paris: Sunny, 25°C' }]
```

### Tool calling with structured output

You can also use [`experimental_output`](https://v5.ai-sdk.dev/docs/reference/ai-sdk-core/generate-text#experimental_output) to generate structured output with `generateText`. This is useful when you want to perform tool calls at the same time.

```typescript
const response = await generateText({
  model: apple(),
  system: `Help the person with getting weather information.`,
  prompt: 'What is the weather in Wroclaw?',
  tools: {
    getWeather,
  },
  experimental_output: Output.object({
    schema: z.object({
      weather: z.string(),
      city: z.string(),
    }),
  }),
})
```

### Supported features

We aim to cover most of the OpenAI supported formats, including the following:

- **Objects**: `z.object({})` with nested properties
- **Arrays**: `z.array()` with `minItems` and `maxItems` constraints
- **Strings**: `z.string()`
- **Numbers**: `z.number()` with `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`
- **Booleans**: `z.boolean()`
- **Enums**: `z.enum([])` for string and number values

The following features are currently not supported due to underlying model limitations:

- **String formats**: `email()`, `url()`, `uuid()`, `datetime()` etc.
- **Regular expressions**: Due to a
- **Unions**: `z.union()`, `z.discriminatedUnion()`

## Availability Check

Always check if Apple Intelligence is available before using the provider:

```typescript
import { apple } from '@react-native-ai/apple';

if (!apple.isAvailable()) {
  // Handle fallback logic
  return;
}
```

## Context Window

Apple Foundation Models have a fixed context window of 4096 tokens. This limit applies to the full request context, including system instructions, previous conversation messages, tool definitions, schemas, and the current user prompt.

The `maxTokens` option only limits how many tokens the model can generate in its response. It does not increase the available context window or reserve enough room for a long prompt.

If the full context is too large, Apple may fail generation with a context-window overflow error. The provider does not automatically estimate tokens, remove messages from your prompt, or retry the request, because token estimates can vary by language and different apps need different memory strategies. Handle this at the application level by catching the error and choosing the recovery behavior that fits your product:

- Start a new conversation without the previous transcript, which is Apple's recommended baseline after this error
- Keep a sliding window of recent messages
- Summarize older messages and include the summary instead of the full transcript
- Ask the user to shorten the prompt or start a new chat

```typescript
import {
  AppleLLMErrorCodes,
  type AppleLLMError,
  apple,
} from '@react-native-ai/apple';
import { generateText } from 'ai';

try {
  const result = await generateText({
    model: apple(),
    messages
  });
} catch (error) {
  const appleError = error as AppleLLMError;

  if (appleError.code === AppleLLMErrorCodes.ContextWindowExceeded) {
    // Apply your app's recovery strategy here.
    // For example: retry with fewer messages or start a new chat.
  }

  throw error;
}
```

For streaming calls, use `fullStream` when you need to inspect provider error parts:

```typescript
import {
  AppleLLMErrorCodes,
  type AppleLLMError,
  apple,
} from '@react-native-ai/apple';
import { streamText } from 'ai';

const result = streamText({
  model: apple(),
  messages
});

for await (const part of result.fullStream) {
  if (part.type === 'error') {
    const error = part.error as AppleLLMError;

    if (error.code === AppleLLMErrorCodes.ContextWindowExceeded) {
      // Apply your app's recovery strategy here.
    }
  }
}
```

If you only consume `textStream`, pass `onError` to `streamText`. The AI SDK does not emit error parts through the text-only stream, so capture the error there and handle it after the stream finishes:

```typescript
import {
  AppleLLMErrorCodes,
  type AppleLLMError,
  apple,
} from '@react-native-ai/apple';
import { streamText } from 'ai';

let streamError: unknown;
const result = streamText({
  model: apple(),
  messages,
  onError: ({ error }) => {
    streamError = error;
  },
});

for await (const delta of result.textStream) {
  console.log(delta);
}

if (streamError) {
  const error = streamError as AppleLLMError;

  if (error.code === AppleLLMErrorCodes.ContextWindowExceeded) {
    // Apply your app's recovery strategy here.
  }

  throw streamError;
}
```

## Available Options

Configure model behavior with generation options:

- `temperature` (0-1): Controls randomness. Higher values = more creative, lower = more focused
- `maxTokens`: Maximum number of tokens to generate
- `topP` (0-1): Nucleus sampling threshold
- `topK`: Top-K sampling parameter

You can pass selected options with either `generateText` or `generateObject` as follows:

```typescript
import { apple } from '@react-native-ai/apple';
import { generateText } from 'ai';

const result = await generateText({
  model: apple(),
  prompt: 'Write a creative story',
  temperature: 0.8,
  maxTokens: 500,
  topP: 0.9,
});
```

## Direct API Access

For advanced use cases, you can access the native Apple Foundation Models API directly:

### AppleFoundationModels

```tsx
import { AppleFoundationModels } from '@react-native-ai/apple'

// Check if Apple Intelligence is available
const isAvailable = AppleFoundationModels.isAvailable()

// Generate text responses
const messages = [{ role: 'user', content: 'Hello' }]
const options = { temperature: 0.7, maxTokens: 100 }

const result = await AppleFoundationModels.generateText(messages, options)
```

On iOS 26.4 and newer, you can also count the number of tokens in a string
before sending it to the model:

```tsx
import { AppleFoundationModels } from '@react-native-ai/apple'

const tokenCount = await AppleFoundationModels.countTokens(
  'Summarize this text in three bullet points.'
)
```

Token counting is useful for estimating prompt size, but it is not a complete
guarantee that a generation request will fit in the model context window. The
full context also includes instructions, previous messages in the transcript,
tools, schemas, and generated output.

The maximum context window size for Apple's Foundation models is 4096 tokens
per session. More information can be found [here](https://developer.apple.com/documentation/technotes/tn3193-managing-the-on-device-foundation-model-s-context-window).
