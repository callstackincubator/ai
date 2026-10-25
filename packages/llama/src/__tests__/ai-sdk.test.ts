import type { LanguageModelV4CallOptions } from '@ai-sdk/provider'
import { describe, expect, mock, test } from 'bun:test'

type Completion = {
  text: string
  content?: string
  reasoning_content?: string
  stopped_eos?: boolean
  timings?: Record<string, number>
}

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    completion: mock(
      async (_params: unknown, _callback?: (token: unknown) => void) =>
        ({ text: 'ok', content: 'ok', stopped_eos: true }) as Completion
    ),
    stopCompletion: mock(async () => {}),
    release: mock(async () => {}),
    embedding: mock(async () => ({ embedding: [0.1, 0.2] })),
    tokenize: mock(async (text: string) => ({ tokens: text.split(' ') })),
    ...overrides,
  }
}

let context = createContext()
const initLlama = mock(async () => context)

mock.module('llama.rn', () => ({ initLlama }))
mock.module('react-native-blob-util', () => ({
  default: { fs: { dirs: { DocumentDir: '/documents' } } },
}))

const { encodeWav, llama } = await import('../ai-sdk')

function createCallOptions(
  overrides: Partial<LanguageModelV4CallOptions> = {}
): LanguageModelV4CallOptions {
  return {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    ...overrides,
  }
}

describe('llama language model', () => {
  test('loads the model once for concurrent prepare calls', async () => {
    initLlama.mockClear()
    context = createContext()
    const model = llama.languageModel('/model.gguf')

    const [first, second] = await Promise.all([
      model.prepare(),
      model.prepare(),
    ])

    expect(first).toBe(second)
    expect(initLlama).toHaveBeenCalledTimes(1)
  })

  test('rejects an aborted generation', async () => {
    context = createContext()
    const model = llama.languageModel('/model.gguf')
    await model.prepare()
    const controller = new AbortController()
    context.completion.mockImplementationOnce(async () => {
      controller.abort()
      return { text: '', content: '' }
    })

    const promise = model.doGenerate(
      createCallOptions({ abortSignal: controller.signal })
    )

    await expect(promise).rejects.toThrow()
  })

  test('returns reasoning before the answer', async () => {
    context = createContext()
    const model = llama.languageModel('/model.gguf')
    await model.prepare()
    context.completion.mockImplementationOnce(async () => ({
      text: '',
      content: '391',
      reasoning_content: 'multiplying',
    }))

    const result = await model.doGenerate(createCallOptions())

    expect(result.content.map((part) => part.type)).toEqual([
      'reasoning',
      'text',
    ])
  })

  test('reads structured output that repeats the generation prompt', async () => {
    context = createContext()
    const model = llama.languageModel('/model.gguf')
    await model.prepare()
    context.completion.mockImplementationOnce(async () => ({
      text: '<|im_start|>assistant\n{"n": 7}',
      content: '',
    }))

    const result = await model.doGenerate(
      createCallOptions({
        responseFormat: { type: 'json', schema: { type: 'object' } },
      })
    )

    expect(result.content).toEqual([{ type: 'text', text: '{"n": 7}' }])
  })

  test('stops enqueueing tokens once the stream is cancelled', async () => {
    context = createContext()
    const model = llama.languageModel('/model.gguf')
    await model.prepare()
    let emitToken: (token: unknown) => void = () => {}
    let finish: (result: Completion) => void = () => {}
    context.completion.mockImplementationOnce(
      (_params, callback) =>
        new Promise((resolve) => {
          emitToken = callback!
          finish = resolve
        })
    )

    const { stream } = await model.doStream(createCallOptions())
    const reader = stream.getReader()
    await reader.read()
    await reader.cancel()

    // Tokens queued natively before the cancel still arrive
    expect(() => emitToken({ token: 'late', content: 'late' })).not.toThrow()
    finish({ text: 'late', content: 'late' })
  })
})

describe('llama embedding model', () => {
  test('embeds one call at a time and counts tokens', async () => {
    context = createContext()
    const model = llama.embeddingModel('/embedding.gguf')

    const result = await model.doEmbed({ values: ['a cat', 'a dog sat'] })

    expect(model.supportsParallelCalls).toBe(false)
    expect(result.usage).toEqual({ tokens: 5 })
  })
})

describe('encodeWav', () => {
  test('writes 16-bit mono PCM at the given sample rate', () => {
    const wav = encodeWav([0, 1, -1], 24000)
    const view = new DataView(wav.buffer)

    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF')
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(24000)
    expect(view.getUint32(40, true)).toBe(6)
    expect(view.getInt16(46, true)).toBe(0x7fff)
    expect(view.getInt16(48, true)).toBe(-0x7fff)
  })
})
