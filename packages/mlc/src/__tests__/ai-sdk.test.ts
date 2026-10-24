import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider'
import { describe, expect, mock, test } from 'bun:test'

mock.module('react-native', () => ({
  TurboModuleRegistry: {
    getEnforcing: () => ({
      generateText: async () => ({
        content: 'ok',
        tool_calls: [],
        finish_reason: 'stop',
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      streamText: async () => 'stream-1',
      onChatUpdate: () => ({ remove: () => {} }),
      onChatComplete: () => ({ remove: () => {} }),
    }),
  },
}))

const { mlc } = await import('../ai-sdk')

function createCallOptions(
  overrides: Partial<LanguageModelV4CallOptions> = {}
): LanguageModelV4CallOptions {
  return {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    ...overrides,
  }
}

async function readFirstPart(
  stream: ReadableStream<LanguageModelV4StreamPart>
) {
  const { value } = await stream.getReader().read()
  return value
}

const reasoningWarning = {
  type: 'unsupported',
  feature: 'reasoning',
  details: 'MLC models do not support configuring reasoning.',
}

describe('mlc language model warnings', () => {
  test('warns that reasoning is unsupported in doGenerate', async () => {
    const result = await mlc
      .languageModel()
      .doGenerate(createCallOptions({ reasoning: 'high' }))

    expect(result.warnings).toEqual([reasoningWarning])
  })

  test('warns that reasoning is unsupported in doStream', async () => {
    const { stream } = await mlc
      .languageModel()
      .doStream(createCallOptions({ reasoning: 'high' }))

    expect(await readFirstPart(stream)).toEqual({
      type: 'stream-start',
      warnings: [reasoningWarning],
    })
  })

  test('does not warn for provider-default reasoning', async () => {
    const result = await mlc
      .languageModel()
      .doGenerate(createCallOptions({ reasoning: 'provider-default' }))

    expect(result.warnings).toEqual([])
  })
})
