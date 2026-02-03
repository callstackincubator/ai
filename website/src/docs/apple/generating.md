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
