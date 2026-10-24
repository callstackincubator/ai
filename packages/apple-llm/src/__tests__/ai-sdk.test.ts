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

describe('apple prompt conversion', () => {
  test('skips reasoning parts from earlier assistant turns', async () => {
    await apple().doGenerate(
      createCallOptions({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'hi' }] },
          {
            role: 'assistant',
            content: [
              { type: 'reasoning', text: 'thinking' },
              { type: 'text', text: 'hello' },
            ],
          },
          { role: 'user', content: [{ type: 'text', text: 'again' }] },
        ],
      })
    )

    expect(generateText.mock.calls.at(-1)![0]).toEqual([
      { role: 'user', content: 'hi', attachments: [] },
      { role: 'assistant', content: 'hello', attachments: [] },
      { role: 'user', content: 'again', attachments: [] },
    ])
  })

  test('skips tool approval responses in tool messages', async () => {
    await apple().doGenerate(
      createCallOptions({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-approval-response',
                approvalId: 'approval-1',
                approved: true,
              },
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'weather',
                output: { type: 'text', value: 'sunny' },
              },
            ],
          },
        ],
      })
    )

    expect(generateText.mock.calls.at(-1)![0]).toEqual([
      {
        role: 'tool',
        content: '[tool-result:weather] {"type":"text","value":"sunny"}',
        attachments: [],
      },
    ])
  })
})
