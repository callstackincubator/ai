---
title: "Tools"
---

AI SDK tools run through ML Kit's
[function calling](https://developers.google.com/ml-kit/genai/prompt/android/function-calling).
Gemini Nano picks a function and its arguments, the AI SDK runs your tool's
`execute` in JavaScript, and sends the result back for the next step.

## Requirements

Function calling needs Gemini Nano 4. On the Samsung Galaxy Z Flip 8 and Fold 8,
the default model is Gemini Nano 4. Elsewhere, ML Kit serves it as the preview
release with the fast preference:

- Select the model with `releaseStage: 'preview'` and `preference: 'fast'`.
- The device's Google account must be in the
  [AICore developer preview](https://developers.google.com/ml-kit/genai/prompt/android/function-calling),
  and the AICore app must list "Gemini Nano 4 Fast".

Check `features` in [`getModelInfo()`](/docs/android/models) for
`'functionCalling'`. Without it, ML Kit fails any request that declares
functions, so the provider sends the request without the tools and returns an
`unsupported` warning for `tools`. Gemini Nano then answers in text.

## Calling Tools

```typescript
import { createAndroidProvider } from '@react-native-ai/android'
import { generateText, isStepCount, tool } from 'ai'
import { z } from 'zod'

const nano = createAndroidProvider({
  model: { releaseStage: 'preview', preference: 'fast' },
})

const { text } = await generateText({
  model: nano(),
  stopWhen: isStepCount(3),
  tools: {
    getWeather: tool({
      description: 'Gets the current weather in a city.',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, condition: 'sunny', temperatureC: 24 }),
    }),
  },
  prompt: 'What is the weather in Paris?',
})
```

Without `stopWhen`, `generateText` stops after the tool call, with
`finishReason: 'tool-calls'`.

Tool calls stream as whole `tool-call` parts, not argument by argument, since
ML Kit returns each call complete.

## Schemas

Tool input schemas are converted to ML Kit's `FunctionSchema`: `type` (with
`null` for nullable), `description`, `properties`, `required`, `enum`,
`format`, `items`, `anyOf`, `title` and the length, item, property and number
limits. Other keywords, such as `$ref` and `oneOf`, are left out.

## Tool Choice

`toolChoice: 'none'` sends no tools. `'auto'` is the default. `'required'` and a
specific tool return an `unsupported` warning, since Gemini Nano decides itself
whether to call a function.

## Tool Results

Results go back to Gemini Nano as function responses, which are JSON objects:
an object result is sent as is, other values as `{ result }`, and errors and
denied approvals as `{ error }`.
