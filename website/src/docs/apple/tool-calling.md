# Tool Calling

Enable Apple Foundation Models to use custom tools in your React Native applications. 

## Important Apple-Specific Behavior

Tools are executed by Apple, not the Vercel AI SDK, which means:

- **No AI SDK callbacks**: `maxSteps`, `onStepStart`, and `onStepFinish` will not be executed
- **Pre-register all tools**: You must pass all tools to `createAppleProvider` upfront
- **Empty toolCallId**: Apple doesn't provide tool call IDs, so they will be empty strings

## Basic Usage

### Prerequisite

All tools must be registered ahead of time with Apple provider. To do so, you must create one by calling `createAppleProvider`:

```typescript
import { createAppleProvider } from '@react-native-ai/apple';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const getWeather = tool({
  description: 'Get current weather information',
  parameters: z.object({
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

### Tool Calling

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

## Inspecting Tool Calls

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
