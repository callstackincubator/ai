import type { LanguageModelV4CallOptions } from '@ai-sdk/provider'
import { beforeEach, describe, expect, mock, test } from 'bun:test'

const generateText = mock(
  async (_messages: unknown, _options: Record<string, unknown>) => [
    { type: 'text', text: 'ok' },
  ]
)

mock.module('react-native', () => ({
  TurboModuleRegistry: {
    getEnforcing: (name: string) =>
      name === 'NativeAppleLLM'
        ? { generateText }
        : { getCurrentLocale: () => 'en-US' },
  },
}))

const { apple } = await import('../ai-sdk')

function createCallOptions(
  overrides: Partial<LanguageModelV4CallOptions> = {}
): LanguageModelV4CallOptions {
  return {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    ...overrides,
  }
}

function lastNativeOptions() {
  return generateText.mock.calls.at(-1)![1]
}

beforeEach(() => {
  generateText.mockClear()
})

describe('apple language model', () => {
  test('forwards the reasoning call option as reasoningLevel', async () => {
    await apple().doGenerate(createCallOptions({ reasoning: 'high' }))

    expect(lastNativeOptions().providerOptions).toMatchObject({
      reasoningLevel: 'deep',
    })
  })

  test('forwards providerOptions.apple.reasoningLevel over reasoning', async () => {
    await apple().doGenerate(
      createCallOptions({
        reasoning: 'high',
        providerOptions: { apple: { reasoningLevel: 'light' } },
      })
    )

    expect(lastNativeOptions().providerOptions).toMatchObject({
      reasoningLevel: 'light',
    })
  })

  test('does not set reasoningLevel for provider-default reasoning', async () => {
    await apple().doGenerate(
      createCallOptions({ reasoning: 'provider-default' })
    )

    expect(
      (lastNativeOptions().providerOptions as Record<string, unknown>)
        .reasoningLevel
    ).toBeUndefined()
  })
})
