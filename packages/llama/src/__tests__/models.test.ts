import { beforeEach, describe, expect, test } from 'bun:test'

import { llamaRnStubRef } from './mocks'

const { createLlamaProvider, LlamaLanguageModel } = await import('../ai-sdk')

interface FakeContext {
  completion: (
    options: unknown,
    onToken?: unknown
  ) => Promise<Record<string, never>>
  stopCompletion: () => Promise<void>
  release: () => Promise<void>
  initMultimodal: () => Promise<boolean>
  releaseMultimodal: () => Promise<void>
  completionCalls: Record<string, unknown>[]
}

function installFakeContext(context: Partial<FakeContext> = {}) {
  const created: Partial<FakeContext>[] = []
  const makeContext = (): FakeContext => {
    const ctx: FakeContext = {
      completionCalls: [],
      completion: async (options) => {
        ctx.completionCalls.push(options as Record<string, unknown>)
        return { content: 'hello' } as unknown as Record<string, never>
      },
      stopCompletion: async () => undefined,
      release: async () => undefined,
      initMultimodal: async () => true,
      releaseMultimodal: async () => undefined,
      ...context,
    }
    created.push(ctx)
    return ctx
  }

  llamaRnStubRef.initLlama = async () => makeContext()
  return created
}

const createdContexts = { current: [] as Partial<FakeContext>[] }

beforeEach(() => {
  createdContexts.current = installFakeContext()
})

function completionResult(overrides: Record<string, unknown>) {
  return {
    content: '',
    tool_calls: undefined,
    timings: { prompt_n: 5, predicted_n: 3 },
    ...overrides,
  }
}

describe('LlamaLanguageModel configuration', () => {
  test('derives the model id from the path', () => {
    const model = new LlamaLanguageModel('/tmp/model.gguf')

    expect(model.provider).toBe('llama')
    expect(model.modelId).toBe('/tmp/model.gguf')
  })

  test('uses a larger context when a projector is configured', () => {
    const withoutProjector = new LlamaLanguageModel('/tmp/model.gguf')
    expect(withoutProjector.supportedUrls).toEqual({})

    const multimodal = new LlamaLanguageModel('/tmp/model.gguf', {
      projectorPath: '/tmp/mmproj.gguf',
    })
    expect(multimodal.supportedUrls['image/*']).toBeDefined()
    expect(multimodal.supportedUrls['audio/*']).toBeDefined()
  })

  test('speechModel requires a vocoder path', () => {
    const provider = createLlamaProvider()

    expect(() => provider.speechModel('/tmp/model.gguf')).toThrow(
      'vocoderPath is required'
    )
  })

  test('imageModel is unsupported', () => {
    expect(() => createLlamaProvider().imageModel('x')).toThrow(
      'Image generation models are not supported by llama.rn'
    )
  })
})

describe('doGenerate', () => {
  test('maps text, reasoning and tool call content', async () => {
    createdContexts.current = installFakeContext({
      completion: async () =>
        completionResult({
          content: 'the answer',
          reasoning_content: 'because',
          tool_calls: [
            {
              id: 'call-1',
              function: { name: 'lookup', arguments: '{"q":"x"}' },
            },
          ],
        }) as unknown as Record<string, never>,
    })

    const model = new LlamaLanguageModel('/tmp/model.gguf')
    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: 'hi' }],
      inputFormat: 'messages',
      mode: { type: 'regular' },
    })

    expect(result.content).toEqual([
      { type: 'text', text: 'the answer' },
      { type: 'reasoning', text: 'because' },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'lookup',
        input: '{"q":"x"}',
      },
    ])
    expect(result.finishReason).toEqual({
      unified: 'tool-calls',
      raw: 'tool-calls',
    })
    expect(result.usage.inputTokens.total).toBe(5)
    expect(result.usage.outputTokens.total).toBe(3)
    expect(result.providerMetadata?.llama).toEqual({
      timings: { prompt_n: 5, predicted_n: 3 },
    })
  })

  test('generates tool call ids when the runtime omits them', async () => {
    createdContexts.current = installFakeContext({
      completion: async () =>
        completionResult({
          tool_calls: [{ function: { name: 'lookup', arguments: '{}' } }],
        }) as unknown as Record<string, never>,
    })

    const result = await new LlamaLanguageModel('/tmp/m.gguf').doGenerate({
      prompt: [{ role: 'user', content: 'hi' }],
      inputFormat: 'messages',
      mode: { type: 'regular' },
    })

    const toolCall = result.content[0] as { toolCallId: string }
    expect(toolCall.toolCallId).toBeTruthy()
  })

  test('normalizes finish reasons from stop flags', async () => {
    const cases = [
      [{ stopped_eos: true }, { unified: 'stop', raw: 'stopped_eos' }],
      [{ stopped_word: true }, { unified: 'stop', raw: 'stopped_word' }],
      [{ stopped_limit: true }, { unified: 'length', raw: 'stopped_limit' }],
      [{}, { unified: 'other', raw: undefined }],
    ] as const

    for (const [flags, expected] of cases) {
      createdContexts.current = installFakeContext({
        completion: async () =>
          completionResult(
            flags as unknown as Record<string, never>
          ) as unknown as Record<string, never>,
      })

      const result = await new LlamaLanguageModel('/tmp/m.gguf').doGenerate({
        prompt: [{ role: 'user', content: 'hi' }],
        inputFormat: 'messages',
        mode: { type: 'regular' },
      })

      expect(result.finishReason).toEqual(expected)
    }
  })

  test('defaults usage to zero when timings are missing', async () => {
    createdContexts.current = installFakeContext({
      completion: async () =>
        ({ content: 'x' }) as unknown as Record<string, never>,
    })

    const result = await new LlamaLanguageModel('/tmp/m.gguf').doGenerate({
      prompt: [{ role: 'user', content: 'hi' }],
      inputFormat: 'messages',
      mode: { type: 'regular' },
    })

    expect(result.usage.inputTokens.total).toBe(0)
    expect(result.usage.outputTokens.total).toBe(0)
  })
})

describe('doStream', () => {
  test('streams parser parts and a final finish part', async () => {
    createdContexts.current = installFakeContext({
      completion: async (_options, onToken) => {
        const emit = onToken as (token: { token: string }) => void
        emit({ token: 'Hello' })
        emit({ token: ' world' })
        return completionResult({
          stopped_eos: true,
        }) as unknown as Record<string, never>
      },
    })

    const model = new LlamaLanguageModel('/tmp/m.gguf')
    const { stream } = await model.doStream({
      prompt: [{ role: 'user', content: 'hi' }],
      inputFormat: 'messages',
      mode: { type: 'regular' },
    })

    const reader = stream.getReader()
    const parts = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      parts.push(value)
    }

    expect(parts.map((part) => part.type)).toEqual([
      'stream-start',
      'text-start',
      'text-delta',
      'text-delta',
      'text-end',
      'finish',
    ])
    expect(
      parts
        .filter((part) => part.type === 'text-delta')
        .map((part) => (part as { delta: string }).delta)
    ).toEqual(['Hello', ' world'])

    const finish = parts.at(-1) as { finishReason: unknown }
    expect(finish.finishReason).toEqual({
      unified: 'stop',
      raw: 'stopped_eos',
    })
  })

  test('stops the completion when the stream is cancelled', async () => {
    let stopped = false
    createdContexts.current = installFakeContext({
      completion: async () => new Promise(() => undefined) as never,
      stopCompletion: async () => {
        stopped = true
      },
    })

    const model = new LlamaLanguageModel('/tmp/m.gguf')
    const { stream } = await model.doStream({
      prompt: [{ role: 'user', content: 'hi' }],
      inputFormat: 'messages',
      mode: { type: 'regular' },
    })

    await stream.cancel()

    expect(stopped).toBe(true)
  })

  test('surfaces completion failures through the stream', async () => {
    createdContexts.current = installFakeContext({
      completion: async () => {
        throw new Error('engine crashed')
      },
    })

    const model = new LlamaLanguageModel('/tmp/m.gguf')
    const { stream } = await model.doStream({
      prompt: [{ role: 'user', content: 'hi' }],
      inputFormat: 'messages',
      mode: { type: 'regular' },
    })

    await expect(stream.getReader().read()).rejects.toThrow(
      'Llama stream failed: Error: engine crashed'
    )
  })
})
