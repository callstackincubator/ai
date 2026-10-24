import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider'
import { describe, expect, mock, test } from 'bun:test'

import { applyHistoryManagement } from '../index'

const summaryResult = {
  content: [
    { type: 'text' as const, text: 'Earlier: the user asked about Paris' },
  ],
  finishReason: { unified: 'stop' as const, raw: 'stop' },
  usage: {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: undefined, text: undefined, reasoning: undefined },
  },
  warnings: [],
}

// A model whose countTokens reads instance state, like the llama.rn model
class TokenCountingModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4'
  readonly provider = 'test'
  readonly modelId = 'test'
  readonly supportedUrls = {}

  private tokensPerCharacter = 1

  doGenerate = mock(
    async (_options: LanguageModelV4CallOptions) => summaryResult
  )
  doStream = mock(async (_options: LanguageModelV4CallOptions) => {
    throw new Error('not used')
  })

  async countTokens(text: string) {
    return text.length * this.tokensPerCharacter
  }
}

const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Tell me about Paris' }] },
  {
    role: 'assistant',
    content: [{ type: 'text', text: 'Paris is in France' }],
  },
  { role: 'user', content: [{ type: 'text', text: 'And Lyon?' }] },
]

describe('history summarization', () => {
  test('counts tokens with the model as receiver', async () => {
    const model = new TokenCountingModel()

    // About 70 characters, so the length / 4 fallback (about 18) stays under
    // the threshold and only the model's own count goes over it
    const result = await applyHistoryManagement(prompt, {
      summarizeHistory: { threshold: 40, model },
    })

    expect(model.doGenerate).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(2)
  })
})
