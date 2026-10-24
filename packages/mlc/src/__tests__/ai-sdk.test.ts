import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider'
import { beforeEach, describe, expect, test } from 'bun:test'

import type { GeneratedMessage } from '../NativeMLCEngine'
import { createFakeEmitter, getMLCStub, readStreamParts } from './mocks'

const { mlc } = await import('../ai-sdk')

const emptyUsageExtra = {
  ttft_s: 0,
  prefill_tokens_per_s: 0,
  prompt_tokens: 0,
  jump_forward_tokens: 0,
  completion_tokens: 0,
  end_to_end_latency_s: 0,
  prefill_tokens: 0,
  inter_token_latency_s: 0,
  decode_tokens_per_s: 0,
  decode_tokens: 0,
}

type UpdateEvent = { delta?: { content?: string; role?: string } }
type CompleteEvent = {
  usage: {
    prompt_tokens: number
    completion_tokens: number
    extra?: Record<string, unknown>
  }
  finish_reason: 'stop' | 'length' | 'tool_calls'
}

let generateTextCalls: [unknown, Record<string, unknown> | undefined][]
let generateTextImpl: () => Promise<GeneratedMessage>
let streamTextCalls: [unknown, Record<string, unknown> | undefined][]
let cancelStreamCalls: string[]
let updateEmitter: ReturnType<typeof createFakeEmitter<UpdateEvent>>
let completeEmitter: ReturnType<typeof createFakeEmitter<CompleteEvent>>
let prepareCalls: string[]
let downloadProgressHandlerCount = 0

function emptyGeneratedMessage(
  overrides: Partial<GeneratedMessage> = {}
): GeneratedMessage {
  return {
    role: 'assistant',
    content: '',
    tool_calls: [],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      extra: {},
    },
    finish_reason: 'stop',
    ...overrides,
  } as GeneratedMessage
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
  generateTextCalls = []
  streamTextCalls = []
  cancelStreamCalls = []
  prepareCalls = []
  downloadProgressHandlerCount = 0
  updateEmitter = createFakeEmitter<UpdateEvent>()
  completeEmitter = createFakeEmitter<CompleteEvent>()
  generateTextImpl = async () =>
    emptyGeneratedMessage({ content: 'native answer' })

  Object.assign(getMLCStub(), {
    getModel: async () => ({}),
    getModels: async () => [],
    generateText: async (
      messages: unknown,
      options?: Record<string, unknown>
    ) => {
      generateTextCalls.push([messages, options])
      return generateTextImpl()
    },
    streamText: async (
      messages: unknown,
      options?: Record<string, unknown>
    ) => {
      streamTextCalls.push([messages, options])
      return 'stream-1'
    },
    cancelStream: async (streamId: string) => {
      cancelStreamCalls.push(streamId)
    },
    prepareModel: async (modelId: string) => {
      prepareCalls.push(modelId)
    },
    unloadModel: async () => undefined,
    removeModel: async () => undefined,
    downloadModel: async () => undefined,
    onChatUpdate: updateEmitter.on,
    onChatComplete: completeEmitter.on,
    onDownloadProgress: () => {
      downloadProgressHandlerCount += 1
      return {
        remove: () => {
          downloadProgressHandlerCount -= 1
        },
      }
    },
  })
})

describe('provider factory', () => {
  test('defaults the model id', () => {
    expect(mlc.languageModel().modelId).toBe('Llama-3.2-3B-Instruct')
  })

  test('honours an explicit model id', () => {
    expect(mlc.languageModel('Custom-Model').modelId).toBe('Custom-Model')
  })

  test('exposes lifecycle helpers against the native module', async () => {
    const model = mlc.languageModel('Model-X')

    await model.prepare()
    expect(prepareCalls).toEqual(['Model-X'])

    await model.download()
    expect(downloadProgressHandlerCount).toBe(0)
  })

  test('download forwards progress events and unsubscribes afterwards', async () => {
    const model = mlc.languageModel('Model-X')
    const progress: unknown[] = []

    let emitProgress: ((event: { percentage: number }) => void) | undefined
    Object.assign(getMLCStub(), {
      onDownloadProgress: (
        handler: (event: { percentage: number }) => void
      ) => {
        emitProgress = handler
        return { remove: () => (emitProgress = undefined) }
      },
    })

    const download = model.download((event) => progress.push(event))
    emitProgress?.({ percentage: 42 })
    await download

    expect(progress).toEqual([{ percentage: 42 }])
    expect(emitProgress).toBeUndefined()
  })
})

describe('doGenerate', () => {
  test('maps generation options onto the native shape', async () => {
    await mlc.languageModel('M').doGenerate(
      callOptions({
        temperature: 0.5,
        maxOutputTokens: 64,
        topP: 0.8,
        topK: 20,
      })
    )

    expect(generateTextCalls[0][1]).toEqual({
      temperature: 0.5,
      maxTokens: 64,
      topP: 0.8,
      topK: 20,
      responseFormat: undefined,
      tools: [],
      toolChoice: 'none',
    })
  })

  test('serializes json response formats', async () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'string' } },
    } as const

    await mlc
      .languageModel('M')
      .doGenerate(callOptions({ responseFormat: { type: 'json', schema } }))

    expect(generateTextCalls[0][1]!.responseFormat).toEqual({
      type: 'json_object',
      schema: JSON.stringify(schema),
    })
  })

  test('converts function tools into native descriptions', async () => {
    await mlc.languageModel('M').doGenerate(
      callOptions({
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Lookup weather',
            inputSchema: {
              type: 'object',
              properties: {
                city: { type: 'string', description: 'City name' },
                undocumented: { type: 'number' },
                skipped: false,
              },
            },
          },
        ],
      })
    )

    expect(generateTextCalls[0][1]!.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Lookup weather',
          parameters: { city: 'City name', undocumented: '' },
        },
      },
    ])
  })

  test('drops provider tools', async () => {
    await mlc.languageModel('M').doGenerate(
      callOptions({
        tools: [
          {
            type: 'provider',
            id: 'browser.search',
            name: 'browser.search',
            args: {},
          },
        ],
      })
    )

    expect(generateTextCalls[0][1]!.tools).toEqual([])
  })

  test('maps toolChoice auto through and warns on unsupported values', () => {
    const warnings: unknown[][] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => warnings.push(args)

    return (async () => {
      try {
        const model = mlc.languageModel('M')

        await model.doGenerate(callOptions({ toolChoice: { type: 'auto' } }))
        expect(generateTextCalls[0][1]!.toolChoice).toBe('auto')

        await model.doGenerate(callOptions({ toolChoice: { type: 'none' } }))
        expect(generateTextCalls[1][1]!.toolChoice).toBe('none')

        await model.doGenerate(
          callOptions({
            toolChoice: { type: 'tool', toolName: 'get_weather' },
          })
        )
        expect(generateTextCalls[2][1]!.toolChoice).toBeUndefined()
        expect(warnings).toHaveLength(1)
        expect(String(warnings[0][0])).toContain("Defaulting to 'none'")
      } finally {
        console.warn = originalWarn
      }
    })()
  })

  test('maps content, tool calls, usage and finish reason', async () => {
    generateTextImpl = async () =>
      emptyGeneratedMessage({
        content: 'the answer',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'get_weather', arguments: { city: 'NYC' } },
          },
        ],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 7,
          total_tokens: 18,
          extra: { ...emptyUsageExtra, decode_tokens: 7 },
        },
        finish_reason: 'tool_calls',
      })

    const result = await mlc.languageModel('M').doGenerate(callOptions())

    expect(result.content).toEqual([
      { type: 'text', text: 'the answer' },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'get_weather',
        input: '{"city":"NYC"}',
      },
    ])
    expect(result.finishReason).toEqual({
      unified: 'tool-calls',
      raw: 'tool_calls',
    })
    expect(result.usage.inputTokens.total).toBe(11)
    expect(result.usage.outputTokens.total).toBe(7)
    expect(result.providerMetadata).toEqual({
      mlc: { extraUsage: { ...emptyUsageExtra, decode_tokens: 7 } },
    })
  })

  test('stringifies missing tool call arguments as "{}"', async () => {
    generateTextImpl = async () =>
      emptyGeneratedMessage({
        tool_calls: [
          {
            id: 'call-2',
            type: 'function',
            function: { name: 'ping', arguments: undefined },
          },
        ],
      })

    const result = await mlc.languageModel('M').doGenerate(callOptions())

    expect(result.content[1]).toEqual({
      type: 'tool-call',
      toolCallId: 'call-2',
      toolName: 'ping',
      input: '{}',
    })
  })

  test('normalizes finish reasons', async () => {
    const model = mlc.languageModel('M')

    for (const [raw, unified] of [
      ['stop', 'stop'],
      ['length', 'length'],
      ['tool_calls', 'tool-calls'],
      ['content_filter', 'other'],
    ] as const) {
      generateTextImpl = async () =>
        emptyGeneratedMessage({
          finish_reason: raw as GeneratedMessage['finish_reason'],
        })

      expect((await model.doGenerate(callOptions())).finishReason).toEqual({
        unified,
        raw,
      })
    }
  })

  test('collapses array prompt content into strings', async () => {
    await mlc.languageModel('M').doGenerate(
      callOptions({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'a' },
              {
                type: 'file',
                mediaType: 'image/png',
                data: 'aa==',
              },
              { type: 'text', text: 'b' },
            ],
          },
        ] as LanguageModelV3Prompt,
      })
    )

    expect(generateTextCalls[0][0]).toEqual([{ role: 'user', content: 'ab' }])
  })
})

describe('doStream', () => {
  test('translates updates and completion into stream parts', async () => {
    const model = mlc.languageModel('M')
    const { stream, rawCall } = await model.doStream(callOptions())

    expect(streamTextCalls).toHaveLength(1)
    expect(rawCall.rawSettings).toEqual({})
    expect(rawCall.rawPrompt).toBeDefined()

    updateEmitter.emit({ delta: { content: 'Hel', role: 'assistant' } })
    updateEmitter.emit({ delta: { content: '', role: 'assistant' } })
    updateEmitter.emit({})
    updateEmitter.emit({ delta: { content: 'lo', role: 'assistant' } })
    completeEmitter.emit({
      finish_reason: 'stop',
      usage: {
        prompt_tokens: 3,
        completion_tokens: 2,
        extra: { ...emptyUsageExtra, decode_tokens: 2 },
      },
    })

    const parts = await readStreamParts(stream)

    expect(parts.map((part) => part.type)).toEqual([
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
    ).toEqual(['Hel', 'lo'])

    const finish = parts.at(-1) as {
      finishReason: unknown
      usage: { inputTokens: { total: number } }
      providerMetadata: unknown
    }
    expect(finish.finishReason).toEqual({ unified: 'stop', raw: 'stop' })
    expect(finish.usage.inputTokens.total).toBe(3)
    expect(finish.providerMetadata).toEqual({
      mlc: { extraUsage: { ...emptyUsageExtra, decode_tokens: 2 } },
    })
  })

  test('stops emitting after cancellation and notifies native', async () => {
    const model = mlc.languageModel('M')
    const { stream } = await model.doStream(callOptions())

    await stream.cancel()

    expect(cancelStreamCalls).toEqual(['stream-1'])

    updateEmitter.emit({ delta: { content: 'late', role: 'assistant' } })
    completeEmitter.emit({
      finish_reason: 'stop',
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    })
    expect(updateEmitter.handlerCount()).toBe(0)
    expect(completeEmitter.handlerCount()).toBe(0)
  })

  test('surfaces native stream failures', async () => {
    Object.assign(getMLCStub(), {
      streamText: async () => {
        throw new Error('engine not ready')
      },
    })

    const model = mlc.languageModel('M')
    const { stream } = await model.doStream(callOptions())

    await expect(readStreamParts(stream)).rejects.toThrow(
      'MLC stream failed: Error: engine not ready'
    )
    expect(updateEmitter.handlerCount()).toBe(0)
  })
})
