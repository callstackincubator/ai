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
const onNanoDownloadProgress = createEmitter()
const onTranscriptionDownloadProgress = createEmitter()

let generateTextResult: Record<string, unknown> = {
  content: 'ok',
  finishReason: 'STOP',
}

const generateText = mock(
  async (
    _runId: string,
    _messages: unknown[],
    _config: unknown,
    _options: unknown
  ): Promise<Record<string, unknown>> => generateTextResult
)
const streamText = mock(
  async (
    _streamId: string,
    _messages: unknown[],
    _config: unknown,
    _options: unknown
  ) => {}
)
const prepareNano = mock(async (_nano?: unknown) => {})
const cancelStream = mock(async (_id: string) => {})
const getModelInfo = mock(async (_nano?: unknown) => ({
  availability: 'downloadable',
}))

const transcribe = mock(
  async (_requestId: string, _audio: string, _config?: unknown) => ({
    text: 'Hello world',
  })
)
const prepareTranscription = mock(async (_config?: unknown) => {})
const getTranscriptionAvailability = mock(
  async (_config?: unknown) => 'downloadable'
)

mock.module('react-native', () => ({
  Platform: { OS: 'android' },
  TurboModuleRegistry: {
    getEnforcing: () => ({
      generateText,
      streamText,
      prepareNano,
      cancelStream,
      getModelInfo,
      onStreamUpdate,
      onStreamComplete,
      onStreamError,
      onNanoDownloadProgress,
      transcribe,
      prepareTranscription,
      getTranscriptionAvailability,
      onTranscriptionDownloadProgress,
    }),
  },
}))

const { createAdkProvider } = await import('../ai-sdk')

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
  model = nano
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
  getModelInfo.mockClear()
  generateTextResult = { content: 'ok', finishReason: 'STOP' }
})

describe('provider', () => {
  test('creates Gemini Nano models', () => {
    expect(nano.modelId).toBe('gemini-nano')
    expect(nano.provider).toBe('adk')
  })

  test('reports Gemini Nano availability', async () => {
    getModelInfo.mockImplementationOnce(async () => ({
      availability: 'available',
      baseModelName: 'nano-v3',
      contextSize: 4096,
    }))

    expect(await createAdkProvider().getModelInfo()).toEqual({
      availability: 'available',
      baseModelName: 'nano-v3',
      contextSize: 4096,
    })
  })

  test('passes the model selection to the availability check', async () => {
    await createAdkProvider({ nano: { preference: 'fast' } }).getModelInfo()

    expect(getModelInfo.mock.calls.at(-1)![0]).toEqual({ preference: 'fast' })
  })

  test('derives isAvailable from the model info', async () => {
    const provider = createAdkProvider()
    expect(await provider.isAvailable()).toBe(true)

    getModelInfo.mockImplementationOnce(async () => ({
      availability: 'downloading',
    }))
    expect(await provider.isAvailable()).toBe(false)
  })
})

describe('prompt conversion', () => {
  test('moves system messages into the agent instruction', async () => {
    const model = createAdkProvider({ instruction: 'Be brief.' })()
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
    await nano.doGenerate(
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
    await nano.doGenerate(
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

  test('drops tool steps from the history with a warning', async () => {
    const result = await nano.doGenerate(
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
                input: {},
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
      content: 'It is 10:00.',
    })
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ feature: 'assistant tool-call parts' })
    )
  })
})

describe('generation options', () => {
  test('maps reasoning levels to a thinking budget', async () => {
    await nano.doGenerate(createCallOptions({ reasoning: 'high' }))

    expect(lastGenerateCall()[3]).toMatchObject({
      thinking: { includeThoughts: true, budget: 24576 },
    })
  })

  test('disables thinking for reasoning none', async () => {
    await nano.doGenerate(createCallOptions({ reasoning: 'none' }))

    expect(lastGenerateCall()[3]).toMatchObject({
      thinking: { includeThoughts: false, budget: 0 },
    })
  })

  test('leaves thinking to the model by default', async () => {
    await nano.doGenerate(createCallOptions())

    expect((lastGenerateCall()[3] as { thinking?: unknown }).thinking).toBe(
      undefined
    )
  })

  test('passes the settings Gemini Nano takes', async () => {
    await nano.doGenerate(
      createCallOptions({ temperature: 0.2, maxOutputTokens: 50, topK: 3 })
    )

    expect(lastGenerateCall()[3]).toEqual({
      temperature: 0.2,
      maxTokens: 50,
      topK: 3,
      thinking: undefined,
    })
  })

  test('warns about settings Gemini Nano ignores', async () => {
    const result = await nano.doGenerate(
      createCallOptions({ topP: 0.5, seed: 1, stopSequences: ['END'] })
    )

    expect(
      result.warnings.map((warning) => 'feature' in warning && warning.feature)
    ).toEqual(['topP', 'seed', 'stopSequences'])
  })

  test('warns that JSON output is unsupported', async () => {
    const result = await nano.doGenerate(
      createCallOptions({ responseFormat: { type: 'json' } })
    )

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'unsupported',
        feature: 'responseFormat',
      })
    )
  })

  test('warns that tools are unsupported', async () => {
    const result = await nano.doGenerate(
      createCallOptions({
        tools: [
          {
            type: 'function',
            name: 'getWeather',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      })
    )

    expect(lastGenerateCall()).toHaveLength(4)
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ type: 'unsupported', feature: 'tools' })
    )
  })
})

describe('doGenerate results', () => {
  test('returns reasoning, text and usage', async () => {
    generateTextResult = {
      content: 'It is sunny.',
      reasoning: 'Check the weather.',
      finishReason: 'STOP',
      usage: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        thoughtsTokenCount: 3,
        cachedContentTokenCount: 4,
      },
    }

    const result = await nano.doGenerate(createCallOptions())

    expect(result.content).toEqual([
      { type: 'reasoning', text: 'Check the weather.' },
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

  test('maps safety finish reasons to content-filter', async () => {
    generateTextResult = { content: '', finishReason: 'SAFETY' }

    const result = await nano.doGenerate(createCallOptions())

    expect(result.finishReason).toEqual({
      unified: 'content-filter',
      raw: 'SAFETY',
    })
  })

  test('attaches error codes to native rejections', async () => {
    generateText.mockImplementationOnce(async () => {
      throw Object.assign(new Error('busy'), { code: 'RATE_LIMITED' })
    })

    expect(nano.doGenerate(createCallOptions())).rejects.toMatchObject({
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

    const error = await nano
      .doGenerate(createCallOptions({ abortSignal: controller.signal }))
      .catch((caught: unknown) => caught)

    expect(error).toBe(controller.signal.reason)
    expect(cancelStream).toHaveBeenCalledTimes(1)
  })
})

describe('doStream', () => {
  test('streams reasoning and text', async () => {
    const parts = await runStream(createCallOptions(), (streamId) => {
      onStreamUpdate.emit({ streamId, delta: 'Thinking', kind: 'reasoning' })
      onStreamUpdate.emit({ streamId, delta: 'Sunny', kind: 'text' })
      onStreamComplete.emit({ streamId, finishReason: 'STOP' })
    })

    expect(parts.map((part) => part.type)).toEqual([
      'stream-start',
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'text-start',
      'text-delta',
      'text-end',
      'finish',
    ])
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

    await provider().prepare({ onProgress: (event) => progress.push(event) })

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

describe('transcription', () => {
  test('transcribes binary audio as base64', async () => {
    const model = createAdkProvider().transcriptionModel({
      language: 'en-US',
      mode: 'advanced',
    })

    const result = await model.doGenerate({
      audio: new Uint8Array([1, 2, 3]),
      mediaType: 'audio/wav',
    })

    const [, audio, config] = transcribe.mock.calls.at(-1)!
    expect(audio).toBe('AQID')
    expect(config).toEqual({ language: 'en-US', mode: 'advanced' })
    expect(result).toMatchObject({
      text: 'Hello world',
      segments: [],
      language: 'en-US',
      durationInSeconds: undefined,
      warnings: [],
      response: { modelId: 'genai-speech-recognition' },
    })
  })

  test('strips data URL prefixes from base64 audio', async () => {
    await createAdkProvider().transcriptionModel().doGenerate({
      audio: 'data:audio/wav;base64,AQID',
      mediaType: 'audio/wav',
    })

    expect(transcribe.mock.calls.at(-1)![1]).toBe('AQID')
  })

  test('cancels the native request on abort', async () => {
    const controller = new AbortController()
    transcribe.mockImplementationOnce(async (requestId) => {
      controller.abort()
      expect(cancelStream.mock.calls.at(-1)![0]).toBe(requestId)
      throw new Error('cancelled')
    })

    await expect(
      createAdkProvider().transcriptionModel().doGenerate({
        audio: 'AQID',
        mediaType: 'audio/wav',
        abortSignal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  test('maps native errors to AdkErrorCodes', async () => {
    transcribe.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Not supported'), {
        code: 'MODEL_UNAVAILABLE',
      })
    })

    await expect(
      createAdkProvider()
        .transcriptionModel()
        .doGenerate({ audio: 'AQID', mediaType: 'audio/wav' })
    ).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' })
  })

  test('reports availability', async () => {
    const model = createAdkProvider().transcriptionModel({ language: 'fr-FR' })

    expect(await model.getAvailability()).toBe('downloadable')
    expect(await model.isAvailable()).toBe(true)
    expect(getTranscriptionAvailability.mock.calls.at(-1)![0]).toEqual({
      language: 'fr-FR',
    })

    getTranscriptionAvailability.mockImplementationOnce(async () => 'weird')
    expect(await model.getAvailability()).toBe('unknown')
  })

  test('reports download progress while preparing', async () => {
    const progress: unknown[] = []
    prepareTranscription.mockImplementationOnce(async () => {
      onTranscriptionDownloadProgress.emit({
        phase: 'progress',
        bytesDownloaded: 50,
      })
    })

    await createAdkProvider()
      .transcriptionModel()
      .prepare({ onProgress: (event) => progress.push(event) })

    expect(progress).toEqual([
      { phase: 'progress', bytesDownloaded: 50, bytesToDownload: undefined },
    ])
  })
})
