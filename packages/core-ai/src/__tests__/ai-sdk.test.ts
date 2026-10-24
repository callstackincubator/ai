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
const createLanguageSession = mock(
  async (_modelHandle: string, _options: Record<string, unknown>) => 'session'
)
const onStreamUpdate = createEmitter()
const onStreamComplete = createEmitter()
const onStreamError = createEmitter()

mock.module('react-native', () => ({
  TurboModuleRegistry: {
    getEnforcing: () => ({
      loadModel,
      unloadModel,
      generateText,
      streamText,
      cancelStream,
      createLanguageSession,
      onStreamUpdate,
      onStreamComplete,
      onStreamError,
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

async function readAll(stream: ReadableStream<LanguageModelV4StreamPart>) {
  const parts: LanguageModelV4StreamPart[] = []
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

const reasoningWarning = {
  type: 'unsupported',
  feature: 'reasoning',
  details: 'Core AI language models do not support configuring reasoning.',
}

describe('core ai reasoning warnings', () => {
  test('warns that reasoning is unsupported', async () => {
    const result = await createModel().doGenerate(
      createCallOptions({ reasoning: 'high' })
    )

    expect(result.warnings).toEqual([reasoningWarning])
  })

  test('does not warn for provider-default or none reasoning', async () => {
    for (const reasoning of ['provider-default', 'none'] as const) {
      const result = await createModel().doGenerate(
        createCallOptions({ reasoning })
      )
      expect(result.warnings).toEqual([])
    }
  })
})
