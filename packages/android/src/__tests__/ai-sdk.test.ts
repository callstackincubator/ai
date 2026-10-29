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

const onStreamEvent = createEmitter()
const onDownloadProgress = createEmitter()

let generateTextResult: Record<string, unknown> = {
  text: 'ok',
  functionCalls: [],
  finishReason: 'STOP',
}

const generateText = mock(
  async (_runId: string, _request: any): Promise<Record<string, unknown>> =>
    generateTextResult
)
const streamText = mock(async (_streamId: string, _request: any) => {})
const prepare = mock(async (_model?: unknown) => {})
const cancel = mock((_id: string) => {})
const isAvailable = mock((_model?: unknown) => true)
const getModelInfo = mock(
  async (_model?: unknown): Promise<Record<string, unknown>> => ({
    availability: 'available',
    features: ['functionCalling', 'thinking'],
  })
)
const transcribe = mock(
  async (_runId: string, _audio: string, _options: unknown) => 'hello world'
)
const getTranscriptionModelInfo = mock(
  async (_options?: unknown): Promise<Record<string, unknown>> => ({
    availability: 'downloadable',
  })
)
const embed = mock(async (values: string[], _taskType?: string) =>
  values.map(() => [0.1, 0.2])
)

mock.module('react-native', () => ({
  Platform: { OS: 'android' },
  TurboModuleRegistry: {
    getEnforcing: () => ({
      generateText,
      streamText,
      prepare,
      cancel,
      isAvailable,
      getModelInfo,
      transcribe,
      getTranscriptionModelInfo,
      embed,
      onStreamEvent,
      onDownloadProgress,
    }),
  },
}))

const { createAndroidProvider } = await import('../ai-sdk')

const nano = createAndroidProvider()()

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

function createCallOptions(
  overrides: Partial<LanguageModelV4CallOptions> = {}
): LanguageModelV4CallOptions {
  return {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    ...overrides,
  }
}

const lastRequest = () => generateText.mock.calls.at(-1)![1]

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
  events: Record<string, unknown>[]
) {
  streamText.mockImplementationOnce(async (streamId: string) => {
    queueMicrotask(() => {
      for (const event of events) onStreamEvent.emit({ streamId, ...event })
    })
  })
  const { stream } = await nano.doStream(options)
  return readAll(stream)
}

beforeEach(() => {
  generateText.mockClear()
  streamText.mockClear()
  prepare.mockClear()
  cancel.mockClear()
  getModelInfo.mockClear()
  generateTextResult = { text: 'ok', functionCalls: [], finishReason: 'STOP' }
})

describe('provider', () => {
  test('creates Gemini Nano models', () => {
    expect(nano.modelId).toBe('gemini-nano')
    expect(nano.provider).toBe('android')
  })

  test('reports availability for the model selection', async () => {
    getModelInfo.mockImplementationOnce(async () => ({
      availability: 'available',
      baseModelName: 'nano-v4',
      contextSize: 4000,
      features: ['functionCalling'],
    }))
    const provider = createAndroidProvider({
      model: { releaseStage: 'preview', preference: 'fast' },
    })

    expect(await provider.getModelInfo()).toEqual({
      availability: 'available',
      baseModelName: 'nano-v4',
      contextSize: 4000,
      features: ['functionCalling'],
    })
    expect(getModelInfo.mock.calls.at(-1)![0]).toEqual({
      releaseStage: 'preview',
      preference: 'fast',
    })
  })

  test('checks availability synchronously', () => {
    expect(createAndroidProvider().isAvailable()).toBe(true)
    isAvailable.mockImplementationOnce(() => false)
    expect(nano.isAvailable()).toBe(false)
  })

  test('reports download progress while preparing', async () => {
    const model = createAndroidProvider()()
    prepare.mockImplementationOnce(async () => {
      onDownloadProgress.emit({ model: 'embedding', phase: 'started' })
      onDownloadProgress.emit({
        model: 'language',
        phase: 'started',
        bytesToDownload: 10,
      })
    })
    const progress: unknown[] = []

    await model.prepare({ onProgress: (event) => progress.push(event) })

    expect(progress).toEqual([
      { phase: 'started', bytesDownloaded: undefined, bytesToDownload: 10 },
    ])
  })
})

describe('doGenerate', () => {
  test('sends history, system prompt and settings', async () => {
    await nano.doGenerate(
      createCallOptions({
        prompt: [
          { role: 'system', content: 'Be brief.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is this?' },
              {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'data', data: pngBytes },
              },
            ],
          },
          {
            role: 'assistant',
            content: [
              { type: 'reasoning', text: 'hmm' },
              { type: 'text', text: 'A logo.' },
            ],
          },
          { role: 'user', content: [{ type: 'text', text: 'Thanks' }] },
        ],
        temperature: 0.2,
        topK: 3,
        seed: 7,
        maxOutputTokens: 100,
      })
    )

    expect(lastRequest()).toEqual({
      messages: [
        {
          role: 'user',
          parts: [
            { type: 'text', text: 'What is this?' },
            { type: 'image', data: 'iVBORw==' },
          ],
        },
        { role: 'model', parts: [{ type: 'text', text: 'A logo.' }] },
        { role: 'user', parts: [{ type: 'text', text: 'Thanks' }] },
      ],
      systemInstruction: 'Be brief.',
      tools: undefined,
      temperature: 0.2,
      topK: 3,
      seed: 7,
      maxOutputTokens: 100,
      enableThinking: undefined,
      model: undefined,
    })
  })

  test('returns text and reasoning', async () => {
    generateTextResult = {
      text: 'Hi',
      reasoning: 'Thinking',
      functionCalls: [],
      finishReason: 'MAX_TOKENS',
    }

    const result = await nano.doGenerate(createCallOptions())

    expect(result.content).toEqual([
      { type: 'reasoning', text: 'Thinking' },
      { type: 'text', text: 'Hi' },
    ])
    expect(result.finishReason).toEqual({
      unified: 'length',
      raw: 'MAX_TOKENS',
    })
  })

  test('declares tools and returns their calls', async () => {
    generateTextResult = {
      text: '',
      functionCalls: [
        { id: 'call-1', name: 'getWeather', arguments: '{"city":"Paris"}' },
      ],
      finishReason: 'STOP',
    }
    const inputSchema = {
      type: 'object' as const,
      properties: { city: { type: 'string' } },
      required: ['city'],
    }

    const result = await nano.doGenerate(
      createCallOptions({
        tools: [
          {
            type: 'function',
            name: 'getWeather',
            description: 'Gets the weather',
            inputSchema,
          },
        ],
      })
    )

    expect(lastRequest().tools).toEqual([
      {
        name: 'getWeather',
        description: 'Gets the weather',
        parameters: JSON.stringify(inputSchema),
      },
    ])
    expect(result.content).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'getWeather',
        input: '{"city":"Paris"}',
      },
    ])
    expect(result.finishReason.unified).toBe('tool-calls')
  })

  test('sends tool calls and results as function parts', async () => {
    await nano.doGenerate(
      createCallOptions({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'Weather?' }] },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'getWeather',
                input: { city: 'Paris' },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'getWeather',
                output: { type: 'text', value: 'Sunny' },
              },
            ],
          },
        ],
      })
    )

    expect(lastRequest().messages.slice(1)).toEqual([
      {
        role: 'model',
        parts: [
          {
            type: 'functionCall',
            id: 'call-1',
            name: 'getWeather',
            json: '{"city":"Paris"}',
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            type: 'functionResponse',
            id: 'call-1',
            name: 'getWeather',
            json: '{"result":"Sunny"}',
          },
        ],
      },
    ])
  })

  test('sends denied tool calls as errors', async () => {
    await nano.doGenerate(
      createCallOptions({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'pay',
                output: { type: 'execution-denied', reason: 'No' },
              },
            ],
          },
        ],
      })
    )

    expect(lastRequest().messages[0].parts[0].json).toBe('{"error":"No"}')
  })

  test('warns and leaves out tools and thinking the model lacks', async () => {
    getModelInfo.mockImplementationOnce(async () => ({
      availability: 'available',
      features: [],
    }))
    const model = createAndroidProvider()()

    const { warnings } = await model.doGenerate(
      createCallOptions({
        tools: [
          { type: 'function', name: 'a', inputSchema: { type: 'object' } },
        ],
        reasoning: 'high',
      })
    )

    expect(lastRequest().tools).toBeUndefined()
    expect(lastRequest().enableThinking).toBeUndefined()
    expect(warnings.map((warning) => (warning as any).feature)).toEqual([
      'tools',
      'reasoning',
    ])
  })

  test('leaves tools out with toolChoice none', async () => {
    await nano.doGenerate(
      createCallOptions({
        tools: [
          {
            type: 'function',
            name: 'getWeather',
            inputSchema: { type: 'object' },
          },
        ],
        toolChoice: { type: 'none' },
      })
    )

    expect(lastRequest().tools).toBeUndefined()
  })

  test('warns about unsupported settings', async () => {
    const { warnings } = await nano.doGenerate(
      createCallOptions({
        topP: 0.9,
        stopSequences: ['x'],
        responseFormat: { type: 'json' },
        tools: [
          { type: 'function', name: 'a', inputSchema: { type: 'object' } },
        ],
        toolChoice: { type: 'required' },
      })
    )

    expect(warnings.map((warning) => (warning as any).feature)).toEqual([
      'topP',
      'stopSequences',
      'responseFormat',
      'toolChoice',
    ])
  })

  test('maps reasoning to thinking mode', async () => {
    await nano.doGenerate(createCallOptions({ reasoning: 'high' }))
    expect(lastRequest().enableThinking).toBe(true)

    await nano.doGenerate(createCallOptions({ reasoning: 'none' }))
    expect(lastRequest().enableThinking).toBe(false)

    await nano.doGenerate(
      createCallOptions({
        providerOptions: { android: { enableThinking: true } },
      })
    )
    expect(lastRequest().enableThinking).toBe(true)
  })

  test('rejects non-image files', async () => {
    await expect(
      nano.doGenerate(
        createCallOptions({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'audio/wav',
                  data: { type: 'data', data: pngBytes },
                },
              ],
            },
          ],
        })
      )
    ).rejects.toMatchObject({ code: 'INVALID_MESSAGE' })
  })

  test('keeps native error codes', async () => {
    generateText.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Quota'), { code: 'RATE_LIMITED' })
    })

    await expect(nano.doGenerate(createCallOptions())).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: 'Quota',
    })
  })

  test('cancels the native run when aborted', async () => {
    const controller = new AbortController()
    generateText.mockImplementationOnce(async () => {
      controller.abort()
      throw new Error('cancelled')
    })

    await expect(
      nano.doGenerate(createCallOptions({ abortSignal: controller.signal }))
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancel).toHaveBeenCalledTimes(1)
  })
  test('stops when aborted while preparing', async () => {
    const controller = new AbortController()
    prepare.mockImplementationOnce(async () => controller.abort())
    generateText.mockClear()

    await expect(
      createAndroidProvider()().doGenerate(
        createCallOptions({ abortSignal: controller.signal })
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(generateText).not.toHaveBeenCalled()
  })
})

describe('doStream', () => {
  test('streams text, reasoning and tool calls', async () => {
    const parts = await runStream(createCallOptions(), [
      { type: 'reasoning', delta: 'Hmm' },
      { type: 'text', delta: 'Hel' },
      { type: 'text', delta: 'lo' },
      {
        type: 'functionCall',
        functionCall: { id: 'c1', name: 'getTime', arguments: '{}' },
      },
      { type: 'finish', finishReason: 'STOP' },
    ])

    expect(parts.map((part) => part.type)).toEqual([
      'stream-start',
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'text-start',
      'text-delta',
      'text-delta',
      'tool-call',
      'text-end',
      'finish',
    ])
    expect(parts.at(-1)).toMatchObject({
      finishReason: { unified: 'tool-calls' },
    })
  })

  test('reports stream errors with their code', async () => {
    const parts = await runStream(createCallOptions(), [
      { type: 'error', error: 'Busy', code: 'RATE_LIMITED' },
    ])

    expect(parts.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'RATE_LIMITED', message: 'Busy' },
    })
  })
})

describe('other models', () => {
  test('transcribes audio', async () => {
    const model = createAndroidProvider().transcriptionModel({
      language: 'en-US',
      mode: 'basic',
    })

    const result = await model.doGenerate({
      audio: pngBytes,
      mediaType: 'audio/wav',
    })

    expect(transcribe.mock.calls.at(-1)!.slice(1)).toEqual([
      'iVBORw==',
      { locale: 'en-US', mode: 'basic' },
    ])
    expect(result.text).toBe('hello world')
    expect(result.language).toBe('en')
  })

  test('derives transcription availability from the model info', async () => {
    const model = createAndroidProvider().transcriptionModel()
    getTranscriptionModelInfo.mockImplementationOnce(async () => ({
      availability: 'downloading',
    }))

    expect(await model.isAvailable()).toBe(false)
    expect(await model.isAvailable()).toBe(true)
  })

  test('embeds values with the task type', async () => {
    const model = createAndroidProvider().embeddingModel({
      taskType: 'semanticSimilarity',
    })

    const result = await model.doEmbed({ values: ['a', 'b'] })

    expect(embed.mock.calls.at(-1)).toEqual([['a', 'b'], 'semanticSimilarity'])
    expect(result.embeddings).toEqual([
      [0.1, 0.2],
      [0.1, 0.2],
    ])
  })
})
