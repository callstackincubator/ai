import type { LanguageModelV3CallOptions } from '@ai-sdk/provider'
import { describe, expect, test } from 'bun:test'

import { buildLlamaCompletionOptions } from '../completionOptions'

function createCallOptions(
  providerOptions?: Record<string, unknown>
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
