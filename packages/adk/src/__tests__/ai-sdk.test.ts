import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider'
import { beforeEach, describe, expect, mock, test } from 'bun:test'

type Listener = (event: any) => void

function createEmitter() {
  const listeners = new Set<Listener>()
  const subscribe = (listener: Listener) => {
    listeners.add(listener)
    return { remove: () => listeners.delete(listener) }
  }
  subscribe.emit = (event: unknown) => {
    for (const listener of listeners) listener(event)
  }
  return subscribe
}

const onStreamUpdate = createEmitter()
const onStreamComplete = createEmitter()
const onStreamError = createEmitter()
const onStreamToolCall = createEmitter()
const onNanoDownloadProgress = createEmitter()

let generateTextResult: Record<string, unknown> = {
  content: 'ok',
  finishReason: 'STOP',
}

const generateText = mock(
  async (
    _runId: string,
    _messages: unknown[],
    _config: unknown,
    _options: unknown,
    _tools: unknown
  ): Promise<Record<string, unknown>> => generateTextResult
)
const streamText = mock(
  async (
    _streamId: string,
    _messages: unknown[],
    _config: unknown,
    _options: unknown,
    _tools: unknown
  ) => {}
)
const prepareNano = mock(async (_nano?: unknown) => {})
const cancelStream = mock(async (_id: string) => {})
const getModelInfo = mock(async (_modelType: string, _nano?: unknown) => ({
  availability: 'downloadable',
}))

mock.module('react-native', () => ({
  Platform: { OS: 'android' },
  TurboModuleRegistry: {
    getEnforcing: () => ({
      generateText,
      streamText,
      prepareNano,
      cancelStream,
      getModelInfo,
      isNanoSupported: async () => true,
      isAvailable: async () => true,
      onToolCall: () => ({ remove: () => {} }),
      onStreamUpdate,
      onStreamToolCall,
      onStreamComplete,
      onStreamError,
      onNanoDownloadProgress,
    }),
  },
}))

const { createAdkProvider } = await import('../ai-sdk')

const gemini = createAdkProvider({ modelType: 'gemini' })()
const nano = createAdkProvider()()

// PNG signature followed by padding bytes
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
])

function createCallOptions(
  overrides: Partial<LanguageModelV4CallOptions> = {}
): LanguageModelV4CallOptions {
  return {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    ...overrides,
  }
}

const lastGenerateCall = () => generateText.mock.calls.at(-1)!

async function readAll(stream: ReadableStream<LanguageModelV4StreamPart>) {
  const parts: LanguageModelV4StreamPart[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) return parts
    parts.push(value)
  }
}

// Starts a stream, then plays native events once the native call is made
async function runStream(
  options: LanguageModelV4CallOptions,
  play: (streamId: string) => void,
  model = gemini
) {
  streamText.mockImplementationOnce(async (streamId: string) => {
    queueMicrotask(() => play(streamId))
  })
  const { stream } = await model.doStream(options)
  return readAll(stream)
}

beforeEach(() => {
  generateText.mockClear()
  streamText.mockClear()
  prepareNano.mockClear()
  cancelStream.mockClear()
  generateTextResult = { content: 'ok', finishReason: 'STOP' }
})

describe('model resolution', () => {
  test('defaults to on-device Gemini Nano', () => {
    expect(nano.modelId).toBe('gemini-nano')
  })

  test('defaults cloud Gemini to gemini-2.5-flash', () => {
    expect(gemini.modelId).toBe('gemini-2.5-flash')
  })

  test('infers cloud Gemini from a model name', async () => {
    const model = createAdkProvider()('gemini-2.5-pro')
    await model.doGenerate(createCallOptions())

    expect(lastGenerateCall()[2]).toMatchObject({
      model: { type: 'gemini', name: 'gemini-2.5-pro' },
    })
  })

  test('per-model options override provider defaults', () => {
    const provider = createAdkProvider({ instruction: 'Be brief.' })
    expect(provider({ modelName: 'gemini-2.5-pro' }).modelId).toBe(
      'gemini-2.5-pro'
    )
    expect(provider.languageModel().modelId).toBe('gemini-nano')
  })

  test('reports model availability', async () => {
    expect(await createAdkProvider().getModelInfo()).toEqual({
      modelType: 'genai-nano',
      modelName: 'gemini-nano',
      availability: 'downloadable',
      baseModelName: undefined,
      contextSize: undefined,
    })
  })
})

describe('prompt conversion', () => {
  test('moves system messages into the agent instruction', async () => {
    const model = createAdkProvider({
      modelType: 'gemini',
      instruction: 'Be brief.',
    })()
    await model.doGenerate(
      createCallOptions({
        prompt: [
          { role: 'system', content: 'Answer in Polish.' },
          { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        ],
      })
    )

    const [, messages, config] = lastGenerateCall()
    expect(messages).toEqual([{ role: 'user', content: 'hello' }])
    expect(config).toMatchObject({
      instruction: 'Be brief.\n\nAnswer in Polish.',
    })
  })

  test('resolves top-level file media types to a full mime type', async () => {
    await gemini.doGenerate(
      createCallOptions({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'describe' },
              {
                type: 'file',
                mediaType: 'image',
                data: { type: 'data', data: pngBytes },
              },
            ],
          },
        ],
      })
    )

    expect(lastGenerateCall()[1]).toEqual([
      {
        role: 'user',
        parts: [
          { type: 'text', text: 'describe' },
          {
            type: 'file',
            mimeType: 'image/png',
            data: 'iVBORw0KGgoAAAAA',
          },
        ],
      },
    ])
  })

  test('passes local image URLs to native code', async () => {
    await gemini.doGenerate(
      createCallOptions({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/jpeg',
                data: { type: 'url', url: new URL('file:///tmp/cat.jpg') },
              },
            ],
          },
        ],
      })
    )

    expect(lastGenerateCall()[1]).toEqual([
      {
        role: 'user',
        parts: [
          { type: 'file', mimeType: 'image/jpeg', uri: 'file:///tmp/cat.jpg' },
        ],
      },
    ])
  })

  test('replays earlier tool steps as assistant text', async () => {
    await gemini.doGenerate(
      createCallOptions({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'time?' }] },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: '1',
                toolName: 'getTime',
                input: { city: 'Warsaw' },
              },
              {
                type: 'tool-result',
                toolCallId: '1',
                toolName: 'getTime',
                output: { type: 'json', value: { time: '10:00' } },
              },
              { type: 'text', text: 'It is 10:00.' },
            ],
          },
          { role: 'user', content: [{ type: 'text', text: 'thanks' }] },
        ],
      })
    )

    expect(lastGenerateCall()[1][1]).toEqual({
      role: 'assistant',
      content:
        '[Tool call: getTime({"city":"Warsaw"})]\n[Tool result for getTime: {"time":"10:00"}]\nIt is 10:00.',
    })
  })
})

const weatherTool = {
  type: 'function' as const,
  name: 'getWeather',
  inputSchema: {
    type: 'object' as const,
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
}

describe('tool choice', () => {
  test('sends no tools for toolChoice none', async () => {
    await gemini.doGenerate(
      createCallOptions({ tools: [weatherTool], toolChoice: { type: 'none' } })
    )

    expect(lastGenerateCall()[4]).toEqual([])
  })

  test('warns that required tool choice is unsupported', async () => {
    const result = await gemini.doGenerate(
      createCallOptions({ toolChoice: { type: 'required' } })
    )

    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'toolChoice',
        details:
          'ADK runs tools natively and cannot be required to call a tool.',
      },
    ])
  })

  test('limits tools to the chosen tool', async () => {
    await gemini.doGenerate(
      createCallOptions({
        tools: [weatherTool, { ...weatherTool, name: 'getTime' }],
        toolChoice: { type: 'tool', toolName: 'getTime' },
      })
    )

    expect(
      (lastGenerateCall()[4] as { name: string }[]).map((tool) => tool.name)
    ).toEqual(['getTime'])
  })

  test('warns when a tool has no registered executor', async () => {
    const result = await gemini.doGenerate(
      createCallOptions({ tools: [weatherTool] })
    )

    expect(result.warnings).toContainEqual({
      type: 'other',
      message:
        'Tool "getWeather" has no executor. Pass it to createAdkProvider via availableTools so ADK can run it.',
    })
  })
})

describe('generation options', () => {
  test('maps reasoning levels to a thinking budget', async () => {
    await gemini.doGenerate(createCallOptions({ reasoning: 'high' }))

    expect(lastGenerateCall()[3]).toMatchObject({
      thinking: { includeThoughts: true, budget: 24576 },
    })
  })

  test('disables thinking for reasoning none', async () => {
    await gemini.doGenerate(createCallOptions({ reasoning: 'none' }))

    expect(lastGenerateCall()[3]).toMatchObject({
      thinking: { includeThoughts: false, budget: 0 },
    })
  })

  test('leaves thinking to the model by default', async () => {
    await gemini.doGenerate(createCallOptions())

    expect((lastGenerateCall()[3] as { thinking?: unknown }).thinking).toBe(
      undefined
    )
  })

  test('passes a response schema to cloud Gemini', async () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } } }
    await gemini.doGenerate(
      createCallOptions({ responseFormat: { type: 'json', schema } })
    )

    expect(lastGenerateCall()[3]).toMatchObject({
      responseFormat: { type: 'json', schema },
    })
  })

  test('puts the response schema in the Gemini Nano instruction', async () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } } }
    await nano.doGenerate(
      createCallOptions({ responseFormat: { type: 'json', schema } })
    )

    const [, , config, options] = lastGenerateCall() as [
      string,
      unknown,
      { instruction: string },
      { responseFormat: { schema?: unknown } },
    ]
    expect(config.instruction).toContain(JSON.stringify(schema))
    expect(options.responseFormat.schema).toBe(undefined)
  })

  test('warns about settings Gemini Nano ignores', async () => {
    const result = await nano.doGenerate(
      createCallOptions({ topP: 0.5, stopSequences: ['END'] })
    )

    expect(
      result.warnings.map((warning) => 'feature' in warning && warning.feature)
    ).toEqual(['topP', 'stopSequences'])
  })
})

describe('doGenerate results', () => {
  test('returns reasoning, provider-executed tool steps and text', async () => {
    generateTextResult = {
      content: 'It is sunny.',
      reasoning: 'Check the weather.',
      toolCalls: [
        { toolCallId: '1', toolName: 'getWeather', input: '{"city":"Oslo"}' },
      ],
      toolResults: [
        { toolCallId: '1', toolName: 'getWeather', output: '{"sky":"clear"}' },
      ],
      finishReason: 'STOP',
      usage: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        thoughtsTokenCount: 3,
        cachedContentTokenCount: 4,
      },
    }

    const result = await gemini.doGenerate(createCallOptions())

    expect(result.content).toEqual([
      { type: 'reasoning', text: 'Check the weather.' },
      {
        type: 'tool-call',
        toolCallId: '1',
        toolName: 'getWeather',
        input: '{"city":"Oslo"}',
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: '1',
        toolName: 'getWeather',
        result: { sky: 'clear' },
      },
      { type: 'text', text: 'It is sunny.' },
    ])
    expect(result.usage.inputTokens).toEqual({
      total: 10,
      noCache: 6,
      cacheRead: 4,
      cacheWrite: undefined,
    })
    expect(result.usage.outputTokens).toEqual({
      total: 8,
      text: 5,
      reasoning: 3,
    })
  })

  test('strips Markdown fences from JSON output', async () => {
    generateTextResult = { content: '```json\n{"a":1}\n```' }

    const result = await nano.doGenerate(
      createCallOptions({ responseFormat: { type: 'json' } })
    )

    expect(result.content).toEqual([{ type: 'text', text: '{"a":1}' }])
  })

  test('maps safety finish reasons to content-filter', async () => {
    generateTextResult = { content: '', finishReason: 'SAFETY' }

    const result = await gemini.doGenerate(createCallOptions())

    expect(result.finishReason).toEqual({
      unified: 'content-filter',
      raw: 'SAFETY',
    })
  })

  test('attaches error codes to native rejections', async () => {
    generateText.mockImplementationOnce(async () => {
      throw Object.assign(new Error('busy'), { code: 'RATE_LIMITED' })
    })

    expect(gemini.doGenerate(createCallOptions())).rejects.toMatchObject({
      message: 'busy',
      code: 'RATE_LIMITED',
    })
  })

  test('cancels the native run when aborted', async () => {
    const controller = new AbortController()
    generateText.mockImplementationOnce(async () => {
      controller.abort()
      throw new Error('cancelled')
    })

    const error = await gemini
      .doGenerate(createCallOptions({ abortSignal: controller.signal }))
      .catch((caught: unknown) => caught)

    expect(error).toBe(controller.signal.reason)
    expect(cancelStream).toHaveBeenCalledTimes(1)
  })
})

describe('doStream', () => {
  test('streams reasoning, tool steps and text', async () => {
    const parts = await runStream(createCallOptions(), (streamId) => {
      onStreamUpdate.emit({ streamId, delta: 'Thinking', kind: 'reasoning' })
      onStreamToolCall.emit({
        streamId,
        phase: 'start',
        toolCallId: '1',
        toolName: 'getWeather',
      })
      onStreamToolCall.emit({
        streamId,
        phase: 'end',
        toolCallId: '1',
        toolName: 'getWeather',
        input: '{}',
      })
      onStreamToolCall.emit({
        streamId,
        phase: 'result',
        toolCallId: '1',
        toolName: 'getWeather',
        output: '{"sky":"clear"}',
      })
      onStreamUpdate.emit({ streamId, delta: 'Sunny', kind: 'text' })
      onStreamComplete.emit({ streamId, finishReason: 'STOP' })
    })

    expect(parts.map((part) => part.type)).toEqual([
      'stream-start',
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'tool-input-start',
      'tool-input-end',
      'tool-call',
      'tool-result',
      'text-start',
      'text-delta',
      'text-end',
      'finish',
    ])
    expect(parts).toContainEqual({
      type: 'tool-result',
      toolCallId: '1',
      toolName: 'getWeather',
      result: { sky: 'clear' },
    })
  })

  test('streams JSON without Markdown fences', async () => {
    const parts = await runStream(
      createCallOptions({ responseFormat: { type: 'json' } }),
      (streamId) => {
        for (const delta of ['``', '`json\n{"a"', ':1}', '\n`', '``']) {
          onStreamUpdate.emit({ streamId, delta })
        }
        onStreamComplete.emit({ streamId })
      },
      nano
    )

    const text = parts
      .flatMap((part) => (part.type === 'text-delta' ? [part.delta] : []))
      .join('')
    expect(text).toBe('{"a":1}')
  })

  test('surfaces native stream errors with their code', async () => {
    const parts = await runStream(createCallOptions(), (streamId) => {
      onStreamError.emit({
        streamId,
        error: 'Too long',
        code: 'CONTEXT_WINDOW_EXCEEDED',
      })
    })

    expect(parts.at(-1)).toMatchObject({
      type: 'error',
      error: { message: 'Too long', code: 'CONTEXT_WINDOW_EXCEEDED' },
    })
  })
})

describe('Gemini Nano preparation', () => {
  test('reports download progress', async () => {
    const provider = createAdkProvider()
    const progress: unknown[] = []
    prepareNano.mockImplementationOnce(async () => {
      onNanoDownloadProgress.emit({ phase: 'started', bytesToDownload: 100 })
      onNanoDownloadProgress.emit({ phase: 'completed' })
    })

    await provider.prepareNano({ onProgress: (event) => progress.push(event) })

    expect(progress).toEqual([
      { phase: 'started', bytesDownloaded: undefined, bytesToDownload: 100 },
      {
        phase: 'completed',
        bytesDownloaded: undefined,
        bytesToDownload: undefined,
      },
    ])
  })

  test('passes the model selection to native code', async () => {
    const provider = createAdkProvider({ nano: { releaseStage: 'preview' } })
    await provider().prepare()

    expect(prepareNano.mock.calls.at(-1)![0]).toEqual({
      releaseStage: 'preview',
    })
  })
})
