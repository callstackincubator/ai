import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider'
import { beforeEach, describe, expect, mock, test } from 'bun:test'

type Listener = (event: Record<string, unknown>) => void

function createEmitter() {
  const listeners = new Set<Listener>()
  const emitter = (listener: Listener) => {
    listeners.add(listener)
    return { remove: () => listeners.delete(listener) }
  }
  emitter.emit = (event: Record<string, unknown>) =>
    listeners.forEach((listener) => listener(event))
  return emitter
}

const usage = {
  inputTokens: 12,
  cachedInputTokens: 2,
  outputTokens: 8,
  reasoningTokens: 3,
}

let handleCount = 0
const loadModel = mock(async () => ({
  modelHandle: `model-${++handleCount}`,
  info: { task: 'language', platforms: ['iOS'], functions: [] },
}))
const unloadModel = mock(async (_modelHandle: string) => {})
const removeModel = mock(async (_config: Record<string, unknown>) => {})
const generateText = mock(
  async (
    _requestId: string,
    _modelHandle: string,
    _messages: Record<string, unknown>[],
    _options: Record<string, unknown>
  ): Promise<Record<string, unknown>> => ({
    content: [{ type: 'text', text: 'ok' }],
    usage,
  })
)
const streamText = mock(
  (
    _streamId: string,
    _modelHandle: string,
    _messages: Record<string, unknown>[],
    _options: Record<string, unknown>
  ) => {}
)
const cancelStream = mock((_streamId: string) => {})
const generateVideo = mock(
  async (
    _requestId: string,
    _config: Record<string, unknown>,
    _prompt: string,
    _options: Record<string, unknown>
  ): Promise<Record<string, unknown>> => ({
    video: 'AAAA',
    mediaType: 'video/mp4',
    uri: 'file:///tmp/video.mp4',
    width: 832,
    height: 480,
    frameCount: 17,
    fps: 16,
    seed: 1,
  })
)
const embed = mock(
  async (
    _config: Record<string, unknown>,
    _values: string[],
    _options: Record<string, unknown>
  ) => ({ embeddings: [[0.6, 0.8]], metadata: { dimensions: 2 } })
)
const runTask = mock(
  async (
    _task: string,
    _config: Record<string, unknown>,
    _input: Record<string, unknown>,
    _options: Record<string, unknown>
  ) => ({ task: 'embedding', output: { embeddings: [[1, 0]] } })
)
const createLanguageSession = mock(
  async (_modelHandle: string, _options: Record<string, unknown>) => 'session'
)
const onStreamUpdate = createEmitter()
const onStreamComplete = createEmitter()
const onStreamError = createEmitter()
const onTranscriptionUpdate = createEmitter()

const transcriptionResult = {
  text: 'hello world',
  segments: [{ text: 'hello world', startSecond: 0, endSecond: 1 }],
  durationInSeconds: 1,
  metadata: { architecture: 'Parakeet TDT', streaming: true },
}
const startTranscriptionStream = mock(
  async (
    _streamId: string,
    _config: Record<string, unknown>,
    _options: Record<string, unknown>
  ) => {}
)
const appendTranscriptionAudio = mock(
  async (_streamId: string, _pcmBase64: string) => {}
)
const finishTranscriptionStream = mock(
  async (_streamId: string): Promise<Record<string, unknown>> =>
    transcriptionResult
)

mock.module('react-native', () => ({
  TurboModuleRegistry: {
    getEnforcing: () => ({
      loadModel,
      unloadModel,
      removeModel,
      generateText,
      streamText,
      cancelStream,
      generateVideo,
      embed,
      runTask,
      createLanguageSession,
      onStreamUpdate,
      onStreamComplete,
      onStreamError,
      startTranscriptionStream,
      appendTranscriptionAudio,
      finishTranscriptionStream,
      onTranscriptionUpdate,
    }),
  },
}))

const { coreAI } = await import('../ai-sdk')

const createModel = () =>
  coreAI({ id: 'model', source: { type: 'bundle', name: 'm' } })

function createCallOptions(
  overrides: Partial<LanguageModelV4CallOptions> = {}
): LanguageModelV4CallOptions {
  return {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    ...overrides,
  }
}

async function readAll<Part = LanguageModelV4StreamPart>(
  stream: ReadableStream<Part>
) {
  const parts: Part[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      return parts
    }
    parts.push(value)
  }
}

// doStream starts the native stream once the model has loaded
async function waitForStreamId() {
  while (streamText.mock.calls.length === 0) {
    await Promise.resolve()
  }
  return streamText.mock.calls.at(-1)![0]
}

beforeEach(() => {
  loadModel.mockClear()
  unloadModel.mockClear()
  removeModel.mockClear()
  generateText.mockClear()
  streamText.mockClear()
  cancelStream.mockClear()
})

describe('core ai language model', () => {
  test('replays the system prompt and history as the transcript', async () => {
    await createModel().doGenerate(
      createCallOptions({
        prompt: [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello!' }],
          },
          { role: 'user', content: [{ type: 'text', text: 'How are you?' }] },
        ],
      })
    )

    expect(generateText.mock.calls[0]![2]).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Hi', attachments: [] },
      {
        role: 'assistant',
        content: 'Hello!',
        parts: [{ type: 'text', text: 'Hello!' }],
      },
      { role: 'user', content: 'How are you?', attachments: [] },
    ])
  })

  test('loads the model once and releases it on unload', async () => {
    const model = createModel()

    await Promise.all([
      model.doGenerate(createCallOptions()),
      model.doGenerate(createCallOptions()),
    ])
    expect(loadModel).toHaveBeenCalledTimes(1)
    const modelHandle = generateText.mock.calls[0]![1]
    expect(generateText.mock.calls[1]![1]).toBe(modelHandle)

    await model.unload()
    expect(unloadModel).toHaveBeenCalledWith(modelHandle)

    await model.doGenerate(createCallOptions())
    expect(loadModel).toHaveBeenCalledTimes(2)
  })

  test('unloads the model before removing its files', async () => {
    const model = createModel()
    await model.doGenerate(createCallOptions())
    const modelHandle = generateText.mock.calls[0]![1]

    await model.remove()
    expect(unloadModel).toHaveBeenCalledWith(modelHandle)
    expect(removeModel).toHaveBeenCalledTimes(1)
    expect(unloadModel.mock.invocationCallOrder[0]!).toBeLessThan(
      removeModel.mock.invocationCallOrder[0]!
    )
    expect(model.modelHandle).toBeUndefined()
  })

  test('waits for a removal before loading again', async () => {
    const model = createModel()
    await model.prepare()
    let finishRemoval: () => void = () => {}
    removeModel.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishRemoval = resolve
        })
    )

    const removal = model.remove()
    const loading = model.prepare()
    while (removeModel.mock.calls.length === 0) {
      await Promise.resolve()
    }
    expect(loadModel).toHaveBeenCalledTimes(1)

    finishRemoval()
    await removal
    await loading
    expect(loadModel).toHaveBeenCalledTimes(2)
    expect(removeModel.mock.invocationCallOrder[0]!).toBeLessThan(
      loadModel.mock.invocationCallOrder[1]!
    )
  })

  test('passes session instructions to native', async () => {
    await createModel().createSession({ instructions: 'Be brief.' })

    expect(createLanguageSession.mock.calls.at(-1)![1]).toEqual({
      instructions: 'Be brief.',
    })
  })

  test('reports native usage', async () => {
    const result = await createModel().doGenerate(createCallOptions())

    expect(result.usage).toEqual({
      inputTokens: {
        total: 12,
        noCache: 10,
        cacheRead: 2,
        cacheWrite: undefined,
      },
      outputTokens: { total: 8, text: 5, reasoning: 3 },
    })
  })

  test('returns reasoning and leaves out tool parts', async () => {
    generateText.mockImplementationOnce(async () => ({
      content: [
        { type: 'reasoning', id: 'r1', text: 'Thinking' },
        { type: 'tool-call', toolCallId: 't1', toolName: 'x', input: '{}' },
        { type: 'text', text: 'Answer' },
      ],
      usage,
    }))

    const result = await createModel().doGenerate(createCallOptions())

    expect(result.content).toEqual([
      {
        type: 'reasoning',
        text: 'Thinking',
        providerMetadata: { 'core-ai': {} },
      },
      { type: 'text', text: 'Answer' },
    ])
  })

  test('streams text deltas from native response snapshots', async () => {
    const { stream } = await createModel().doStream(createCallOptions())
    const parts = readAll(stream)

    const streamId = await waitForStreamId()
    onStreamUpdate.emit({ streamId, content: 'Hel' })
    onStreamUpdate.emit({ streamId, content: 'Hello' })
    onStreamUpdate.emit({ streamId, content: 'Hello world' })
    onStreamComplete.emit({ streamId, usage })

    const allParts = await parts
    const deltas = allParts
      .filter((part) => part.type === 'text-delta')
      .map((part) => part.delta)

    expect(deltas).toEqual(['Hel', 'lo', ' world'])
    expect(allParts.at(-1)).toMatchObject({
      type: 'finish',
      usage: { outputTokens: { total: 8, text: 5, reasoning: 3 } },
    })
  })

  test('streams reasoning entries before the text', async () => {
    const { stream } = await createModel().doStream(createCallOptions())
    const parts = readAll(stream)

    const streamId = await waitForStreamId()
    const reasoning = (text: string) => [{ type: 'reasoning', id: 'r1', text }]
    onStreamUpdate.emit({ streamId, content: '', entries: reasoning('Let') })
    onStreamUpdate.emit({
      streamId,
      content: '',
      entries: reasoning('Let me think'),
    })
    onStreamUpdate.emit({ streamId, content: 'Done' })
    onStreamComplete.emit({ streamId, usage })

    expect((await parts).map((part) => part.type)).toEqual([
      'stream-start',
      'reasoning-start',
      'reasoning-delta',
      'reasoning-delta',
      'reasoning-end',
      'text-start',
      'text-delta',
      'text-end',
      'finish',
    ])
  })

  test('keeps the native error code on stream errors', async () => {
    const { stream } = await createModel().doStream(createCallOptions())
    const parts = readAll(stream)

    const streamId = await waitForStreamId()
    onStreamError.emit({
      streamId,
      code: 'CORE_AI_UNSUPPORTED_CAPABILITY',
      error: 'No guided generation.',
    })

    const error = (await parts).find((part) => part.type === 'error')
    expect(error).toMatchObject({
      error: {
        message: 'No guided generation.',
        code: 'CORE_AI_UNSUPPORTED_CAPABILITY',
      },
    })
  })

  test('cancels the native request when generation is aborted', async () => {
    let rejectGeneration: (error: Error) => void = () => {}
    generateText.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectGeneration = reject
        })
    )
    cancelStream.mockImplementationOnce(() =>
      rejectGeneration(new Error('Core AI request was cancelled.'))
    )
    const abortController = new AbortController()

    const result = createModel().doGenerate(
      createCallOptions({ abortSignal: abortController.signal })
    )
    while (generateText.mock.calls.length === 0) {
      await Promise.resolve()
    }
    abortController.abort()

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancelStream).toHaveBeenCalledWith(generateText.mock.calls[0]![0])
  })

  test('cancels the native stream when streaming is aborted', async () => {
    const abortController = new AbortController()
    const { stream } = await createModel().doStream(
      createCallOptions({ abortSignal: abortController.signal })
    )
    const parts = readAll(stream)

    const streamId = await waitForStreamId()
    abortController.abort()

    await expect(parts).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancelStream).toHaveBeenCalledWith(streamId)
  })
})

describe('core ai language model warnings', () => {
  test('warns about settings Core AI ignores', async () => {
    const result = await createModel().doGenerate(
      createCallOptions({
        topP: 0.9,
        topK: 40,
        seed: 1,
        presencePenalty: 0.5,
        frequencyPenalty: 0.5,
        stopSequences: ['END'],
        tools: [
          {
            type: 'function',
            name: 'weather',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      })
    )

    expect(
      result.warnings.map((warning) =>
        warning.type === 'unsupported' ? warning.feature : warning.type
      )
    ).toEqual([
      'topP',
      'topK',
      'seed',
      'presencePenalty',
      'frequencyPenalty',
      'stopSequences',
      'tools',
    ])
    expect(generateText.mock.calls[0]![3]).toEqual({
      maxTokens: undefined,
      temperature: undefined,
      providerOptions: {},
    })
  })

  test('leaves files out of the prompt with a warning', async () => {
    const result = await createModel().doGenerate(
      createCallOptions({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is this?' },
              {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'data', data: 'iVBORw0KGgo=' },
              },
            ],
          },
        ],
      })
    )

    expect(generateText.mock.calls[0]![2]).toEqual([
      { role: 'user', content: 'What is this?', attachments: [] },
    ])
    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'file parts',
        details:
          'Core AI language models do not accept files yet, so they were left out of the prompt.',
      },
    ])
  })

  test('warns in stream-start', async () => {
    const { stream } = await createModel().doStream(
      createCallOptions({ topK: 40 })
    )

    const { value } = await stream.getReader().read()
    expect(value).toMatchObject({
      type: 'stream-start',
      warnings: [{ type: 'unsupported', feature: 'topK' }],
    })
  })
})

describe('core ai structured output', () => {
  const schema = {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  } as const

  test('sends the response format schema for guided generation', async () => {
    const result = await createModel().doGenerate(
      createCallOptions({ responseFormat: { type: 'json', schema } })
    )

    expect(generateText.mock.calls[0]![3]).toMatchObject({ schema })
    expect(result.warnings).toEqual([])
  })

  test('streams structured output', async () => {
    const { stream } = await createModel().doStream(
      createCallOptions({ responseFormat: { type: 'json', schema } })
    )
    const parts = readAll(stream)

    const streamId = await waitForStreamId()
    expect(streamText.mock.calls[0]![3]).toMatchObject({ schema })
    onStreamUpdate.emit({ streamId, content: '{"name":"Ada"}' })
    onStreamComplete.emit({ streamId, usage })

    const text = (await parts)
      .filter((part) => part.type === 'text-delta')
      .map((part) => part.delta)
      .join('')
    expect(JSON.parse(text)).toEqual({ name: 'Ada' })
  })

  test('warns that JSON without a schema is not enforced', async () => {
    const result = await createModel().doGenerate(
      createCallOptions({ responseFormat: { type: 'json' } })
    )

    expect(generateText.mock.calls[0]![3].schema).toBeUndefined()
    expect(result.warnings).toMatchObject([
      { type: 'unsupported', feature: 'responseFormat' },
    ])
  })
})

function lastReasoningLevel() {
  return generateText.mock.calls.at(-1)![3].providerOptions?.reasoningLevel
}

describe('core ai reasoning', () => {
  test('forwards the reasoning call option as reasoningLevel', async () => {
    const result = await createModel().doGenerate(
      createCallOptions({ reasoning: 'high' })
    )

    expect(lastReasoningLevel()).toBe('deep')
    expect(result.warnings).toEqual([])
  })

  test('forwards providerOptions core-ai reasoningLevel over reasoning', async () => {
    await createModel().doGenerate(
      createCallOptions({
        reasoning: 'high',
        providerOptions: { 'core-ai': { reasoningLevel: 'light' } },
      })
    )

    expect(lastReasoningLevel()).toBe('light')
  })

  test('turns thinking off for reasoning none', async () => {
    await createModel().doGenerate(createCallOptions({ reasoning: 'none' }))

    expect(lastReasoningLevel()).toBe('none')
  })

  test('keeps the model default for provider-default reasoning', async () => {
    const result = await createModel().doGenerate(
      createCallOptions({ reasoning: 'provider-default' })
    )

    expect(lastReasoningLevel()).toBeUndefined()
    expect(result.warnings).toEqual([])
  })
})

describe('core ai streaming transcription', () => {
  const createTranscriptionModel = () =>
    coreAI.transcriptionModel({
      id: 'parakeet',
      source: { type: 'file', uri: '/parakeet' },
    })

  const audioStream = (chunks: (Uint8Array | string)[]) =>
    new ReadableStream<Uint8Array | string>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk))
        controller.close()
      },
    })

  const update = (
    streamId: string,
    type: string,
    segmentIndex: number,
    text: string
  ) =>
    onTranscriptionUpdate.emit({
      streamId,
      type,
      segmentIndex,
      text,
      startSecond: segmentIndex,
      endSecond: segmentIndex + 0.5,
    })

  beforeEach(() => {
    startTranscriptionStream.mockClear()
    appendTranscriptionAudio.mockClear()
    finishTranscriptionStream.mockClear()
  })

  test('sends whole 16-bit samples at the input rate', async () => {
    const { stream } = await createTranscriptionModel().doStream({
      audio: audioStream([new Uint8Array([1, 2, 3]), btoa('\x04')]),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    })
    await readAll(stream)

    expect(startTranscriptionStream.mock.calls[0][2]).toEqual({
      sampleRate: 24000,
    })
    // The odd byte of the first chunk is carried into the second
    expect(appendTranscriptionAudio.mock.calls.map(([, pcm]) => pcm)).toEqual([
      btoa('\x01\x02'),
      btoa('\x03\x04'),
    ])
  })

  test('streams what each update adds and closes segments', async () => {
    appendTranscriptionAudio.mockImplementationOnce(async (streamId) => {
      update(streamId, 'partial', 0, 'Hello')
      update(streamId, 'partial', 0, 'Hello world')
      update(streamId, 'final', 0, 'Hello world.')
      update(streamId, 'partial', 1, ' How')
    })

    const { stream } = await createTranscriptionModel().doStream({
      audio: audioStream([new Uint8Array([0, 0])]),
      inputAudioFormat: { type: 'audio/pcm' },
    })
    const parts = await readAll(stream)

    expect(startTranscriptionStream.mock.calls[0][2]).toEqual({
      sampleRate: 16000,
    })
    expect(parts.filter(({ type }) => type === 'transcript-delta')).toEqual([
      { type: 'transcript-delta', id: 'segment-0', delta: 'Hello' },
      { type: 'transcript-delta', id: 'segment-0', delta: ' world' },
      { type: 'transcript-delta', id: 'segment-0', delta: '.' },
      { type: 'transcript-delta', id: 'segment-1', delta: ' How' },
    ])
    expect(parts.filter(({ type }) => type === 'transcript-final')).toEqual([
      {
        type: 'transcript-final',
        id: 'segment-0',
        text: 'Hello world.',
        startSecond: 0,
        endSecond: 0.5,
      },
    ])
    expect(parts.at(-1)).toEqual({
      type: 'finish',
      text: 'hello world',
      segments: transcriptionResult.segments,
      durationInSeconds: 1,
      providerMetadata: { 'core-ai': transcriptionResult.metadata },
    })
  })

  test('cancels the native stream when the audio fails', async () => {
    appendTranscriptionAudio.mockImplementationOnce(async () => {
      throw new Error('model busy')
    })

    const { stream } = await createTranscriptionModel().doStream({
      audio: audioStream([new Uint8Array([0, 0])]),
      inputAudioFormat: { type: 'audio/pcm' },
    })

    await expect(readAll(stream)).rejects.toThrow('model busy')
    expect(cancelStream).toHaveBeenCalled()
    expect(finishTranscriptionStream).not.toHaveBeenCalled()
  })

  test('cancels the audio source when transcription fails', async () => {
    startTranscriptionStream.mockImplementationOnce(async () => {
      throw new Error('no model')
    })
    let cancelReason: unknown
    const audio = new ReadableStream<Uint8Array>({
      cancel(reason) {
        cancelReason = reason
      },
    })

    const { stream } = await createTranscriptionModel().doStream({
      audio,
      inputAudioFormat: { type: 'audio/pcm' },
    })

    await expect(readAll(stream)).rejects.toThrow('no model')
    expect(cancelReason).toEqual(new Error('no model'))
    expect(audio.locked).toBe(false)
  })

  test('does not start with an aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      createTranscriptionModel().doStream({
        audio: audioStream([]),
        inputAudioFormat: { type: 'audio/pcm' },
        abortSignal: controller.signal,
      })
    ).rejects.toThrow()
    expect(startTranscriptionStream).not.toHaveBeenCalled()
  })

  test('errors when aborted while finishing', async () => {
    const controller = new AbortController()
    finishTranscriptionStream.mockImplementationOnce(async () => {
      controller.abort(new Error('stopped'))
      return transcriptionResult
    })

    const { stream } = await createTranscriptionModel().doStream({
      audio: audioStream([new Uint8Array([0, 0])]),
      inputAudioFormat: { type: 'audio/pcm' },
      abortSignal: controller.signal,
    })

    await expect(readAll(stream)).rejects.toThrow('stopped')
  })

  test('rejects audio that is not pcm', async () => {
    await expect(
      createTranscriptionModel().doStream({
        audio: audioStream([]),
        inputAudioFormat: { type: 'audio/pcmu', rate: 8000 },
      })
    ).rejects.toThrow('audio/pcm')
  })
})

describe('core ai embeddings', () => {
  const embeddingModel = () =>
    coreAI.embeddingModel({
      id: 'clip',
      source: { type: 'file', uri: '/clip' },
    })

  test('passes core-ai provider options and returns the metadata', async () => {
    const result = await embeddingModel().doEmbed({
      values: ['a cat'],
      providerOptions: { 'core-ai': { batchSize: 4 } },
    })

    expect(embed.mock.calls.at(-1)![1]).toEqual(['a cat'])
    expect(embed.mock.calls.at(-1)![2]).toEqual({ batchSize: 4 })
    expect(result.embeddings).toEqual([[0.6, 0.8]])
    expect(result.providerMetadata).toEqual({ 'core-ai': { dimensions: 2 } })
  })

  test('embeds images as a batch through the embedding task', async () => {
    const result = await embeddingModel().embedImages(['file:///a.jpg'])

    const [task, config, input] = runTask.mock.calls.at(-1)!
    expect(task).toBe('embedding')
    expect(config).toMatchObject({ sourceUri: '/clip', task: 'embedding' })
    expect(input).toEqual({ data: { imageUris: ['file:///a.jpg'] } })
    expect(result.embeddings).toEqual([[1, 0]])
  })
})

describe('core ai video generation', () => {
  const videoModel = () =>
    coreAI.videoModel({ id: 'wan', source: { type: 'file', uri: '/wan' } })

  const callOptions = (overrides: object = {}) => ({
    prompt: 'a cat',
    n: 1,
    aspectRatio: undefined,
    resolution: undefined,
    duration: undefined,
    fps: undefined,
    seed: undefined,
    image: undefined,
    frameImages: undefined,
    inputReferences: undefined,
    generateAudio: undefined,
    providerOptions: {},
    ...overrides,
  })

  const lastOptions = () => generateVideo.mock.calls.at(-1)![3]

  test('returns the mp4 and its metadata', async () => {
    const result = await videoModel().doGenerate(callOptions())

    expect(result.videos).toEqual([
      { type: 'base64', data: 'AAAA', mediaType: 'video/mp4' },
    ])
    expect(result.providerMetadata).toEqual({
      'core-ai': {
        uri: 'file:///tmp/video.mp4',
        width: 832,
        height: 480,
        frameCount: 17,
        fps: 16,
        seed: 1,
      },
    })
    expect(result.warnings).toEqual([])
  })

  test('maps resolution, duration, fps and seed', async () => {
    await videoModel().doGenerate(
      callOptions({
        resolution: '320x192',
        duration: 2,
        fps: 8,
        seed: 7,
        providerOptions: { 'core-ai': { stepCount: 4 } },
      })
    )

    expect(lastOptions()).toEqual({
      width: 320,
      height: 192,
      duration: 2,
      fps: 8,
      seed: 7,
      stepCount: 4,
    })
  })

  test('maps known aspect ratios and warns about others', async () => {
    await videoModel().doGenerate(callOptions({ aspectRatio: '9:16' }))
    expect(lastOptions()).toMatchObject({ width: 480, height: 832 })

    const { warnings } = await videoModel().doGenerate(
      callOptions({ aspectRatio: '4:3' })
    )
    expect(warnings).toEqual([
      expect.objectContaining({ type: 'unsupported', feature: 'aspectRatio' }),
    ])
  })

  test('warns about image and audio inputs', async () => {
    const { warnings } = await videoModel().doGenerate(
      callOptions({
        image: { type: 'url', url: 'https://example.com/a.png' },
        generateAudio: true,
      })
    )

    expect(warnings).toEqual([
      expect.objectContaining({ feature: 'image' }),
      expect.objectContaining({ feature: 'generateAudio' }),
    ])
  })

  test('cancels the native request on abort', async () => {
    const controller = new AbortController()
    generateVideo.mockImplementationOnce(async (requestId) => {
      controller.abort()
      expect(cancelStream).toHaveBeenCalledWith(requestId)
      throw new Error('cancelled')
    })

    await expect(
      videoModel().doGenerate(callOptions({ abortSignal: controller.signal }))
    ).rejects.toThrow('cancelled')
  })
})
