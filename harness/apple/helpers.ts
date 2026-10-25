import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider'
import { apple, createAppleProvider } from '@react-native-ai/apple'
import { tool } from 'ai'
import { z } from 'zod'

export function prompt(text: string): LanguageModelV4CallOptions['prompt'] {
  return [{ role: 'user', content: [{ type: 'text', text }] }]
}

export async function readAll(
  stream: ReadableStream<LanguageModelV4StreamPart>
) {
  const parts: LanguageModelV4StreamPart[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      return parts
    }
    parts.push(value)
  }
}

export function textOf(parts: LanguageModelV4StreamPart[]) {
  return parts
    .flatMap((part) => (part.type === 'text-delta' ? [part.delta] : []))
    .join('')
}

// JavaScript tools that record their calls, registered with a provider so
// Foundation Models can run them natively
export function createTools() {
  const calls: { name: string; input: unknown }[] = []
  const tools = {
    getWeather: tool({
      description: 'Get the current weather in a city.',
      inputSchema: z.object({ city: z.string() }),
      execute: async (input) => {
        calls.push({ name: 'getWeather', input })
        return `Weather in ${input.city}: sunny, 24 degrees`
      },
    }),
    getCurrentTime: tool({
      description: 'Get the current time.',
      inputSchema: z.object({}),
      execute: async (input) => {
        calls.push({ name: 'getCurrentTime', input })
        return '10:42'
      },
    }),
  }
  return {
    calls,
    tools,
    provider: createAppleProvider({ availableTools: tools }),
  }
}

export function imagePrompt(
  text: string,
  image: { data: string | Uint8Array; filename?: string }
): LanguageModelV4CallOptions['prompt'] {
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text },
        {
          type: 'file',
          mediaType: 'image/png',
          filename: image.filename,
          data: { type: 'data', data: image.data },
        },
      ],
    },
  ]
}

export async function answer(
  options: Pick<LanguageModelV4CallOptions, 'prompt' | 'providerOptions'>
) {
  const result = await apple().doGenerate(options)
  return result.content.flatMap((part) =>
    part.type === 'text' ? [part.text] : []
  )
}
