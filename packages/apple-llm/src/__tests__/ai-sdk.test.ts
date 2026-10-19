import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import type {
  AppleGenerationOptions,
  StreamErrorEvent,
  StreamUpdateEvent,
} from '../NativeAppleLLM'
import {
  createFakeEmitter,
  getAppleEmbeddingsStub,
  getAppleLLMStub,
  getAppleUtilsStub,
  readStreamParts,
} from './mocks'

const { createAppleProvider } = await import('../ai-sdk')

type GenerateTextResult = {
  type: 'text' | 'tool-call' | 'tool-result'
  text?: string
  toolName?: string
  input?: string
  output?: string
}[]

let generateTextCalls: [unknown, AppleGenerationOptions][]
let generateTextImpl: (
  messages: unknown,
  options: AppleGenerationOptions
) => Promise<GenerateTextResult>
let generateStreamCalls: [string, unknown, AppleGenerationOptions][]
let cancelStreamCalls: string[]
let isAvailableCalls: number
let updateEmitter: ReturnType<typeof createFakeEmitter<StreamUpdateEvent>>
let completeEmitter: ReturnType<typeof createFakeEmitter<{ streamId: string }>>
let errorEmitter: ReturnType<typeof createFakeEmitter<StreamErrorEvent>>

function installNativeStub() {
  generateTextCalls = []
  generateStreamCalls = []
  cancelStreamCalls = []
  isAvailableCalls = 0
  updateEmitter = createFakeEmitter<StreamUpdateEvent>()
  completeEmitter = createFakeEmitter<{ streamId: string }>()
  errorEmitter = createFakeEmitter<StreamErrorEvent>()

  Object.assign(getAppleLLMStub(), {
    isAvailable: () => {
      isAvailableCalls += 1
      return true
    },
    countTokens: async () => 0,
    generateText: async (
      messages: unknown,
      options: AppleGenerationOptions
    ) => {
      generateTextCalls.push([messages, options])
      return generateTextImpl(messages, options)
    },
    generateStream: (
      streamId: string,
      messages: unknown,
      options: AppleGenerationOptions
    ) => {
      generateStreamCalls.push([streamId, messages, options])
    },
    cancelStream: (streamId: string) => {
      cancelStreamCalls.push(streamId)
    },
    onStreamUpdate: updateEmitter.on,
    onStreamComplete: completeEmitter.on,
    onStreamError: errorEmitter.on,
  })

  Object.assign(getAppleUtilsStub(), {
    getCurrentLocale: () => 'en-US',
  })
}

function callOptions(
  overrides: Partial<LanguageModelV3CallOptions> = {}
): LanguageModelV3CallOptions {
  return {
    prompt: [{ role: 'user', content: 'hello' }],
    inputFormat: 'messages',
    mode: { type: 'regular' },
    ...overrides,
  } as LanguageModelV3CallOptions
}

beforeEach(() => {
  installNativeStub()
  generateTextImpl = async () => [{ type: 'text', text: 'ok' }]
})

afterEach(() => {
  globalThis.__APPLE_LLM_TOOLS__ = {}
})

describe('provider factory', () => {
  test('callable factory returns a language model', async () => {
    const provider = createAppleProvider()
    const model = provider()

    expect(model.provider).toBe('apple')
    expect(model.modelId).toBe('system-default')
    expect(model.specificationVersion).toBe('v3')
    expect(await provider.isAvailable()).toBe(true)
    expect(isAvailableCalls).toBe(1)
  })

  test('imageModel is unsupported', () => {
    const provider = createAppleProvider()

    expect(() => provider.imageModel()).toThrow(
      'Image generation models are not supported by Apple LLM'
    )
  })

  test('embedding model exposes static metadata', () => {
    const model = createAppleProvider().textEmbeddingModel()

    expect(model.modelId).toBe('NLContextualEmbedding')
    expect(model.maxEmbeddingsPerCall).toBe(Infinity)
    expect(model.supportsParallelCalls).toBe(false)
  })
})

describe('doGenerate option mapping', () => {
  test('forwards sampling options and omits schema outside json mode', async () => {
    const model = createAppleProvider().languageModel()

    await model.doGenerate(
      callOptions({
        maxOutputTokens: 128,
        temperature: 0.2,
        topP: 0.9,
        topK: 40,
      })
    )

    expect(generateTextCalls).toHaveLength(1)
    const [messages, options] = generateTextCalls[0]

    expect(messages).toEqual([{ role: 'user', content: 'hello' }])
    expect(options).toEqual({
      maxTokens: 128,
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
      tools: [],
      schema: undefined,
    })
  })

  test('passes responseFormat schema through in json mode', async () => {
    const model = createAppleProvider().languageModel()
    const schema = {
      type: 'object',
      properties: { a: { type: 'string' } },
    } as const

    await model.doGenerate(
      callOptions({ responseFormat: { type: 'json', schema } })
    )

    expect(generateTextCalls[0][1].schema).toBe(schema)
  })

  test('maps native parts to V3 content with providerExecuted tool calls', async () => {
    generateTextImpl = async () => [
      { type: 'text', text: 'hi' },
      { type: 'tool-call', toolName: 'get_weather', input: '{"city":"NYC"}' },
      { type: 'tool-result', toolName: 'get_weather', output: '{"ok":true}' },
    ]
    const model = createAppleProvider().languageModel()

    const result = await model.doGenerate(callOptions())

    expect(result.content).toEqual([
      { type: 'text', text: 'hi' },
      {
        type: 'tool-call',
        toolCallId: '',
        providerExecuted: true,
        toolName: 'get_weather',
        input: '{"city":"NYC"}',
      },
      {
        type: 'tool-result',
        toolCallId: '',
        providerExecuted: true,
        toolName: 'get_weather',
        result: '{"ok":true}',
      },
    ])
    expect(result.finishReason).toEqual({ unified: 'stop', raw: 'stop' })
    expect(result.usage.inputTokens.total).toBe(0)
    expect(result.usage.outputTokens.total).toBe(0)
    expect(result.warnings).toEqual([])
  })
})

describe('prepareMessages', () => {
  test('concatenates text parts and drops unsupported parts', async () => {
    const warnings: unknown[][] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => warnings.push(args)

    try {
      const model = createAppleProvider().languageModel()
      await model.doGenerate(
        callOptions({
          prompt: [
            { role: 'system', content: 'be brief' },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'one ' },
                { type: 'text', text: 'two' },
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: 'aGVsbG8=',
                },
              ],
            },
          ] as LanguageModelV3Prompt,
        })
      )

      expect(generateTextCalls[0][0]).toEqual([
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'one two' },
      ])
      expect(warnings).toHaveLength(1)
    } finally {
      console.warn = originalWarn
    }
  })
})

describe('tool handling', () => {
  test('rejects non-function tools', async () => {
    const model = createAppleProvider().languageModel()

    await expect(
      model.doGenerate(
        callOptions({
          tools: [
            {
              type: 'provider',
              id: 'web.search',
              name: 'web.search',
              args: {},
            },
          ],
        })
      )
    ).rejects.toThrow('Unsupported tool type')
  })

  test('registers tool executors and cleans them up afterwards', async () => {
    let toolsDuringCall: string[] = []
    generateTextImpl = async () => {
      toolsDuringCall = Object.keys(globalThis.__APPLE_LLM_TOOLS__)
      return [{ type: 'text', text: 'done' }]
    }

    const executed: unknown[] = []
    const model = createAppleProvider({
      availableTools: {
        lookup: {
          type: 'function',
          inputSchema: z.object({ query: z.string() }),
          execute: async (args: unknown) => {
            executed.push(args)
            return { found: true }
          },
        },
      },
    }).languageModel()

    await model.doGenerate(
      callOptions({
        tools: [
          {
            type: 'function',
            name: 'lookup',
            inputSchema: {
              type: 'object',
              properties: { query: { type: 'string' } },
            },
          },
        ],
      })
    )

    expect(toolsDuringCall).toHaveLength(1)
    expect(Object.keys(globalThis.__APPLE_LLM_TOOLS__)).toEqual([])

    const executor = (
      generateTextCalls[0][1].tools as {
        id: string
        execute: (input: unknown) => Promise<unknown>
      }[]
    )[0]

    expect(await executor.execute('{"query":"cats"}')).toEqual({
      found: true,
    })
    expect(executed).toEqual([{ query: 'cats' }])
    expect(await executor.execute({ query: 'objects too' })).toEqual({
      found: true,
    })
  })

  test('keeps native tool definitions in the shape the bridge expects', async () => {
    const model = createAppleProvider().languageModel()

    await model.doGenerate(
      callOptions({
        tools: [
          {
            type: 'function',
            name: 'lookup',
            description: 'Look things up',
            inputSchema: {
              type: 'object',
              properties: { query: { type: 'string' } },
            },
          },
        ],
      })
    )

    const tools = generateTextCalls[0][1].tools as {
      id: string
      name: string
      description: string
    }[]

    expect(tools).toHaveLength(1)
    expect(typeof tools[0].id).toBe('string')
    expect(tools[0].id.length).toBeGreaterThan(0)
    expect(tools[0].name).toBe('lookup')
    expect(tools[0].description).toBe('Look things up')
  })
})

describe('doStream', () => {
  test('rejects streaming json responses', async () => {
    const model = createAppleProvider().languageModel()

    await expect(
      model.doStream(
        callOptions({
          responseFormat: { type: 'json', schema: { type: 'object' } },
        })
      )
    ).rejects.toThrow('Streaming JSON responses is not yet supported.')
  })

  test('emits text deltas computed from cumulative native content', async () => {
    const model = createAppleProvider().languageModel()
    const { stream } = await model.doStream(callOptions())
    const [streamId] = generateStreamCalls[0]

    updateEmitter.emit({ streamId, content: 'Hello' })
    updateEmitter.emit({ streamId, content: 'Hello world' })
    updateEmitter.emit({ streamId, content: 'Goodbye' })
    completeEmitter.emit({ streamId })

    const parts = await readStreamParts(stream)

    expect(parts.map((part) => part.type)).toEqual([
      'text-start',
      'text-delta',
      'text-delta',
      'text-delta',
      'text-end',
      'finish',
    ])
    expect(
      parts
        .filter((part) => part.type === 'text-delta')
        .map((part) => (part as { delta: string }).delta)
    ).toEqual(['Hello', ' world', 'Goodbye'])
  })

  test('drops bogus literal "null" chunks', async () => {
    const model = createAppleProvider().languageModel()
    const { stream } = await model.doStream(callOptions())
    const [streamId] = generateStreamCalls[0]

    updateEmitter.emit({ streamId, content: 'null' })
    updateEmitter.emit({ streamId, content: 'nonnull' })
    completeEmitter.emit({ streamId })

    const parts = await readStreamParts(stream)

    expect(
      parts
        .filter((part) => part.type === 'text-delta')
        .map((part) => (part as { delta: string }).delta)
    ).toEqual(['nonnull'])
  })

  test('ignores events from other streams', async () => {
    const model = createAppleProvider().languageModel()
    const { stream } = await model.doStream(callOptions())
    const reader = stream.getReader()

    updateEmitter.emit({ streamId: 'other', content: 'ignored' })
    const first = await reader.read()
    expect(first.value?.type).toBe('text-start')

    const pending = reader.read()
    updateEmitter.emit({ streamId: generateStreamCalls[0][0], content: 'x' })
    const second = await pending
    expect(second.value).toEqual({
      type: 'text-delta',
      delta: 'x',
      id: generateStreamCalls[0][0],
    })
  })

  test('maps known error codes onto typed errors', async () => {
    const model = createAppleProvider().languageModel()
    const { stream } = await model.doStream(callOptions())
    const [streamId] = generateStreamCalls[0]

    errorEmitter.emit({
      streamId,
      error: 'no model',
      code: 'MODEL_UNAVAILABLE',
    })

    const parts = await readStreamParts(stream)
    const errorPart = parts.find((part) => part.type === 'error') as {
      error: Error & { code?: string }
    }

    expect(parts.map((part) => part.type)).toEqual(['text-start', 'error'])
    expect(errorPart.error.message).toBe('no model')
    expect(errorPart.error.code).toBe('MODEL_UNAVAILABLE')
  })

  test('falls back to a plain Error for unknown codes', async () => {
    const model = createAppleProvider().languageModel()
    const { stream } = await model.doStream(callOptions())
    const [streamId] = generateStreamCalls[0]

    errorEmitter.emit({ streamId, error: 'boom', code: 'WEIRD_CODE' })

    const parts = await readStreamParts(stream)
    const errorPart = parts.find((part) => part.type === 'error') as {
      error: Error & { code?: string }
    }

    expect(errorPart.error.message).toBe('boom')
    expect(errorPart.error.code).toBeUndefined()
  })

  test('removes all listeners once the stream finishes', async () => {
    const model = createAppleProvider().languageModel()
    const { stream } = await model.doStream(callOptions())
    const [streamId] = generateStreamCalls[0]

    expect(
      updateEmitter.handlerCount() +
        completeEmitter.handlerCount() +
        errorEmitter.handlerCount()
    ).toBe(3)

    completeEmitter.emit({ streamId })
    await readStreamParts(stream)

    expect(updateEmitter.handlerCount()).toBe(0)
    expect(completeEmitter.handlerCount()).toBe(0)
    expect(errorEmitter.handlerCount()).toBe(0)
  })

  test('cancelling the stream cancels generation natively', async () => {
    const model = createAppleProvider().languageModel()
    const { stream } = await model.doStream(callOptions())
    const [streamId] = generateStreamCalls[0]

    await stream.cancel()

    expect(cancelStreamCalls).toEqual([streamId])
    expect(updateEmitter.handlerCount()).toBe(0)
  })

  test('surfaces native failures through the stream', async () => {
    const nativeError = new Error('native exploded')
    Object.assign(getAppleLLMStub(), {
      generateStream: () => {
        throw nativeError
      },
    })

    const model = createAppleProvider().languageModel()
    const { stream } = await model.doStream(callOptions())

    await expect(readStreamParts(stream)).rejects.toThrow(
      'Apple LLM stream failed: Error: native exploded'
    )
  })

  test('exposes the raw call for inspection', async () => {
    const model = createAppleProvider().languageModel()
    const options = callOptions()
    const { rawCall } = await model.doStream(options)

    expect(rawCall.rawPrompt).toBe(options.prompt)
    expect(rawCall.rawSettings).toEqual({})
  })
})

describe('embedding model', () => {
  test('prepares lazily and forwards language default', async () => {
    const prepared: string[] = []
    const embedded: [string[], string][] = []
    Object.assign(getAppleEmbeddingsStub(), {
      prepare: async (language: string) => {
        prepared.push(language)
      },
      generateEmbeddings: async (values: string[], language: string) => {
        embedded.push([values, language])
        return values.map(() => [0.1, 0.2])
      },
    })

    const model = createAppleProvider().textEmbeddingModel()
    const result = await model.doEmbed({ values: ['a', 'b'] })

    expect(prepared).toEqual(['en-US'])
    expect(embedded).toEqual([[['a', 'b'], 'en-US']])
    expect(result.embeddings).toHaveLength(2)
    expect(result.warnings).toEqual([])
  })

  test('respects an explicit language', async () => {
    let usedLanguage = ''
    Object.assign(getAppleEmbeddingsStub(), {
      prepare: async (language: string) => {
        usedLanguage = language
      },
      generateEmbeddings: async () => [[0]],
    })

    await createAppleProvider()
      .textEmbeddingModel({ language: 'pl-PL' })
      .doEmbed({ values: ['x'] })

    expect(usedLanguage).toBe('pl-PL')
  })
})

describe('transcription model', () => {
  test('joins segment texts and reports duration', async () => {
    let transcribeArgs: [ArrayBufferLike, string] | undefined
    globalThis.__apple__llm__transcribe__ = async (
      audio: ArrayBufferLike,
      language: string
    ) => {
      transcribeArgs = [audio, language]
      return {
        duration: 1.5,
        segments: [
          { text: 'hello', startSecond: 0, endSecond: 1 },
          { text: 'world', startSecond: 1, endSecond: 2 },
        ],
      }
    }

    const model = createAppleProvider().transcriptionModel()
    const result = await model.doGenerate({
      audio: Buffer.from([1, 2, 3]).toString('base64'),
      mediaType: 'audio/wav',
    })

    expect(result.text).toBe('hello world')
    expect(result.durationInSeconds).toBe(1.5)
    expect(result.language).toBe('en-US')
    expect([...new Uint8Array(transcribeArgs![0])]).toEqual([1, 2, 3])
    expect(transcribeArgs![1]).toBe('en-US')
    expect(result.segments).toHaveLength(2)
  })

  test('wraps native failures with context', async () => {
    globalThis.__apple__llm__transcribe__ = async () => {
      throw new Error('no audio')
    }

    const model = createAppleProvider().transcriptionModel()

    await expect(
      model.doGenerate({ audio: new Uint8Array([1]), mediaType: 'audio/wav' })
    ).rejects.toThrow('Apple transcription failed: no audio')
  })
})

describe('speech model', () => {
  test('wraps synthesizer output in a WAV buffer', async () => {
    let speechArgs: [string, { language: string; voice?: string }] | undefined
    globalThis.__apple__llm__generate_audio__ = async (
      text: string,
      options: object
    ) => {
      speechArgs = [text, options as { language: string; voice?: string }]
      return {
        data: new Uint8Array([1, 2, 3, 4]).buffer,
        sampleRate: 24000,
        channels: 1,
        bitsPerSample: 16,
        formatType: 0,
      }
    }

    const result = await createAppleProvider()
      .speechModel()
      .doGenerate({ text: 'hi', voice: 'samantha' })

    expect(speechArgs).toEqual(['hi', { language: 'en-US', voice: 'samantha' }])
    expect(result.audio).toHaveLength(48)
    expect(String.fromCharCode(...result.audio.slice(0, 4))).toBe('RIFF')
    expect([...result.audio.slice(44)]).toEqual([1, 2, 3, 4])
  })

  test('wraps native failures with context', async () => {
    globalThis.__apple__llm__generate_audio__ = async () => {
      throw new Error('no voice')
    }

    await expect(
      createAppleProvider()
        .speechModel()
        .doGenerate({ text: 'hi', voice: undefined })
    ).rejects.toThrow('Apple speech synthesis failed: no voice')
  })
})
