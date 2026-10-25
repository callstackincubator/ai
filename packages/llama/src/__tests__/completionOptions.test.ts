import type {
  LanguageModelV4CallOptions,
  SharedV4Warning,
} from '@ai-sdk/provider'
import { describe, expect, test } from 'bun:test'

import {
  buildLlamaCompletionOptions,
  prepareMessagesWithMedia,
} from '../completionOptions'

function createCallOptions(
  providerOptions?: Record<string, unknown>
): LanguageModelV4CallOptions {
  return {
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      },
    ],
    inputFormat: 'messages',
    mode: {
      type: 'regular',
    },
    providerOptions,
  }
}

describe('buildLlamaCompletionOptions', () => {
  test('forwards providerOptions.llama values', () => {
    const completionOptions = buildLlamaCompletionOptions(
      createCallOptions({
        llama: {
          enable_thinking: true,
          reasoning_format: 'deepseek',
        },
      }),
      []
    )

    expect(completionOptions.enable_thinking).toBe(true)
    expect(completionOptions.reasoning_format).toBe('deepseek')
  })

  test('keeps default reasoning_format when providerOptions.llama is absent', () => {
    const completionOptions = buildLlamaCompletionOptions(
      createCallOptions(),
      []
    )

    expect(completionOptions.reasoning_format).toBe('auto')
  })
})

describe('buildLlamaCompletionOptions reasoning', () => {
  test('disables thinking for reasoning none', () => {
    const completionOptions = buildLlamaCompletionOptions(
      { ...createCallOptions(), reasoning: 'none' },
      []
    )

    expect(completionOptions.enable_thinking).toBe(false)
    expect(completionOptions.thinking_budget_tokens).toBeUndefined()
  })

  test('leaves thinking to the chat template by default', () => {
    const completionOptions = buildLlamaCompletionOptions(
      { ...createCallOptions(), reasoning: 'provider-default' },
      [],
      { contextSize: 4096 }
    )

    expect(completionOptions.enable_thinking).toBeUndefined()
    expect(completionOptions.thinking_budget_tokens).toBeUndefined()
  })

  test('maps reasoning levels to a thinking budget from maxOutputTokens', () => {
    const completionOptions = buildLlamaCompletionOptions(
      { ...createCallOptions(), reasoning: 'medium', maxOutputTokens: 8000 },
      [],
      { contextSize: 4096 }
    )

    expect(completionOptions.enable_thinking).toBe(true)
    expect(completionOptions.thinking_budget_tokens).toBe(2400)
  })

  test('sizes the thinking budget from the context size', () => {
    const completionOptions = buildLlamaCompletionOptions(
      { ...createCallOptions(), reasoning: 'high' },
      [],
      { contextSize: 4096 }
    )

    expect(completionOptions.thinking_budget_tokens).toBe(2458)
  })

  test('lets providerOptions.llama override the reasoning option', () => {
    const completionOptions = buildLlamaCompletionOptions(
      {
        ...createCallOptions({ llama: { enable_thinking: false } }),
        reasoning: 'high',
      },
      [],
      { contextSize: 4096 }
    )

    expect(completionOptions.enable_thinking).toBe(false)
  })
})

describe('buildLlamaCompletionOptions responseFormat', () => {
  test('passes the JSON schema to llama.rn', () => {
    const schema = {
      type: 'object' as const,
      properties: { name: { type: 'string' as const } },
    }
    const completionOptions = buildLlamaCompletionOptions(
      {
        ...createCallOptions(),
        responseFormat: { type: 'json', schema },
      },
      []
    )

    expect(completionOptions.response_format).toEqual({
      type: 'json_object',
      schema,
    })
  })
})

describe('prepareMessagesWithMedia', () => {
  const imageBytes = new Uint8Array([137, 80, 78, 71])

  test('keeps text and media of a user message in one message', () => {
    const messages = prepareMessagesWithMedia([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: imageBytes },
          },
        ],
      },
    ])

    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,iVBORw==' },
          },
        ],
      },
    ])
  })

  test('sends a single text part as a string', () => {
    const messages = prepareMessagesWithMedia([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ])

    expect(messages).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'hello' },
    ])
  })

  test('adds a subtype to bare media types and keeps base64 strings', () => {
    const [message] = prepareMessagesWithMedia([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image',
            data: { type: 'data', data: 'iVBORw==' },
          },
        ],
      },
    ])

    expect(message!.content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/*;base64,iVBORw==' } },
    ])
  })

  test('passes file URLs through unchanged', () => {
    const [message] = prepareMessagesWithMedia([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image/jpeg',
            data: {
              type: 'url',
              url: new URL('file:///tmp/my%20photo.jpg'),
              originalUrl: 'file:///tmp/my photo.jpg',
            },
          },
        ],
      },
    ])

    expect(message!.content).toEqual([
      { type: 'image_url', image_url: { url: 'file:///tmp/my photo.jpg' } },
    ])
  })

  test('maps audio to input_audio with its format', () => {
    const [message] = prepareMessagesWithMedia([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'audio/mpeg',
            data: { type: 'data', data: 'SUQz' },
          },
          {
            type: 'file',
            mediaType: 'audio/wav',
            data: { type: 'url', url: new URL('file:///tmp/clip.wav') },
          },
        ],
      },
    ])

    expect(message!.content).toEqual([
      {
        type: 'input_audio',
        input_audio: { format: 'mp3', data: 'data:audio/mpeg;base64,SUQz' },
      },
      {
        type: 'input_audio',
        input_audio: { format: 'wav', url: 'file:///tmp/clip.wav' },
      },
    ])
  })

  test('rejects media types llama.rn cannot read', () => {
    expect(() =>
      prepareMessagesWithMedia([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'application/pdf',
              data: { type: 'data', data: 'JVBERi0=' },
            },
          ],
        },
      ])
    ).toThrow('application/pdf')
  })

  test('flattens assistant text and reasoning parts', () => {
    const [message] = prepareMessagesWithMedia([
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'The user says hi.' },
          { type: 'text', text: 'Hello' },
          { type: 'text', text: ' there' },
        ],
      },
    ])

    expect(message).toMatchObject({
      role: 'assistant',
      content: 'Hello there',
      reasoning_content: 'The user says hi.',
    })
  })
})

describe('buildLlamaCompletionOptions tools', () => {
  const inputSchema = {
    type: 'object' as const,
    properties: { city: { type: 'string' as const } },
    required: ['city'],
  }
  const tools: LanguageModelV4CallOptions['tools'] = [
    {
      type: 'function',
      name: 'getWeather',
      description: 'Get the weather',
      inputSchema,
    },
    { type: 'function', name: 'getTime', inputSchema: { type: 'object' } },
  ]

  test('sends the input schema as OpenAI-style parameters', () => {
    const completionOptions = buildLlamaCompletionOptions(
      { ...createCallOptions(), tools },
      []
    )

    expect(completionOptions.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'getWeather',
          description: 'Get the weather',
          parameters: inputSchema,
        },
      },
      {
        type: 'function',
        function: {
          name: 'getTime',
          description: undefined,
          parameters: { type: 'object' },
        },
      },
    ])
    expect(completionOptions.tool_choice).toBe('auto')
  })

  test('offers only the named tool and requires it', () => {
    const completionOptions = buildLlamaCompletionOptions(
      {
        ...createCallOptions(),
        tools,
        toolChoice: { type: 'tool', toolName: 'getTime' },
      },
      []
    )

    expect(completionOptions.tools).toHaveLength(1)
    expect((completionOptions.tools as any[])[0].function.name).toBe('getTime')
    expect(completionOptions.tool_choice).toBe('required')
  })

  test('warns about and skips provider tools', () => {
    const warnings: SharedV4Warning[] = []
    const completionOptions = buildLlamaCompletionOptions(
      {
        ...createCallOptions(),
        tools: [
          {
            type: 'provider',
            id: 'openai.web_search',
            name: 'search',
            args: {},
          },
        ],
      },
      [],
      { warnings }
    )

    expect(completionOptions.tools).toEqual([])
    expect(warnings).toEqual([
      { type: 'unsupported', feature: 'provider tool openai.web_search' },
    ])
  })
})

describe('buildLlamaCompletionOptions defaults', () => {
  // llama.rn keeps the previous n_predict when it is left out
  test('sends an unlimited n_predict without maxOutputTokens', () => {
    const completionOptions = buildLlamaCompletionOptions(
      createCallOptions(),
      []
    )

    expect(completionOptions.n_predict).toBe(-1)
  })

  test('sends maxOutputTokens as n_predict', () => {
    const completionOptions = buildLlamaCompletionOptions(
      { ...createCallOptions(), maxOutputTokens: 12 },
      []
    )

    expect(completionOptions.n_predict).toBe(12)
  })

  test('turns thinking off for structured output and warns about reasoning', () => {
    const warnings: SharedV4Warning[] = []
    const completionOptions = buildLlamaCompletionOptions(
      {
        ...createCallOptions(),
        reasoning: 'high',
        responseFormat: { type: 'json', schema: { type: 'object' } },
      },
      [],
      { warnings }
    )

    expect(completionOptions.enable_thinking).toBe(false)
    expect(warnings).toEqual([
      expect.objectContaining({ type: 'unsupported', feature: 'reasoning' }),
    ])
  })

  test('does not offer tools for tool choice none', () => {
    const completionOptions = buildLlamaCompletionOptions(
      {
        ...createCallOptions(),
        tools: [
          {
            type: 'function',
            name: 'getTime',
            inputSchema: { type: 'object' },
          },
        ],
        toolChoice: { type: 'none' },
      },
      []
    )

    expect(completionOptions.tools).toBeUndefined()
    expect(completionOptions.tool_choice).toBeUndefined()
  })
})
