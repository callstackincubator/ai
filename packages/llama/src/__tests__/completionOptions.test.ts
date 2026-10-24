import type { LanguageModelV3CallOptions } from '@ai-sdk/provider'
import { describe, expect, test } from 'bun:test'

import { buildLlamaCompletionOptions } from '../completionOptions'

function createCallOptions(
  providerOptions?: Record<string, unknown>,
  overrides: Partial<LanguageModelV3CallOptions> = {}
): LanguageModelV3CallOptions {
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
    ...overrides,
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

  test('providerOptions.llama overrides generated defaults', () => {
    const completionOptions = buildLlamaCompletionOptions(
      createCallOptions({
        llama: { reasoning_format: 'deepseek', n_predict: 12 },
      }),
      []
    )

    expect(completionOptions.reasoning_format).toBe('deepseek')
    expect(completionOptions.n_predict).toBe(12)
  })

  test('maps generic sampling options onto llama.rn params', () => {
    const completionOptions = buildLlamaCompletionOptions(
      createCallOptions(undefined, {
        temperature: 0.4,
        maxOutputTokens: 32,
        topP: 0.9,
        topK: 40,
        presencePenalty: 0.1,
        frequencyPenalty: 0.2,
        stopSequences: ['END'],
        seed: 7,
      }),
      []
    )

    expect(completionOptions).toMatchObject({
      messages: [],
      temperature: 0.4,
      n_predict: 32,
      top_p: 0.9,
      top_k: 40,
      penalty_present: 0.1,
      penalty_freq: 0.2,
      stop: ['END'],
      seed: 7,
    })
  })

  test('wraps tools into the chat-completions shape', () => {
    const completionOptions = buildLlamaCompletionOptions(
      createCallOptions(undefined, {
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Lookup weather',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      }),
      []
    )

    expect(completionOptions.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Lookup weather',
          inputSchema: { type: 'object', properties: {} },
        },
      },
    ])
    expect(completionOptions.tool_choice).toBe('auto')
  })

  test('uses the requested toolChoice type', () => {
    const completionOptions = buildLlamaCompletionOptions(
      createCallOptions(undefined, {
        tools: [],
        toolChoice: { type: 'none' },
      }),
      []
    )

    expect(completionOptions.tool_choice).toBe('none')
  })

  test('maps json response formats', () => {
    const schema = { type: 'object' }
    const completionOptions = buildLlamaCompletionOptions(
      createCallOptions(undefined, {
        responseFormat: { type: 'json', schema },
      }),
      []
    )

    expect(completionOptions.response_format).toEqual({
      type: 'json_object',
      schema,
    })
  })

  test('omits response_format outside json mode', () => {
    const completionOptions = buildLlamaCompletionOptions(
      createCallOptions(undefined, {
        responseFormat: { type: 'text' },
      }),
      []
    )

    expect(completionOptions.response_format).toBeUndefined()
  })
})
