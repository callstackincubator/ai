import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider'
import { describe, expect, mock, test } from 'bun:test'

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

const onStreamUpdate = createEmitter()
const onStreamComplete = createEmitter()
const onStreamError = createEmitter()
const streamText = mock((_streamId: string) => {})

mock.module('react-native', () => ({
  TurboModuleRegistry: {
    getEnforcing: () => ({
      generateText: async () => [{ type: 'text', text: 'ok' }],
      streamText,
      cancelStream: () => {},
      onStreamUpdate,
      onStreamComplete,
      onStreamError,
    }),
  },
}))

const { coreAI } = await import('../core-ai/ai-sdk')

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

describe('core ai language model', () => {
  test('streams text deltas from native response snapshots', async () => {
    const model = coreAI({ id: 'model', source: { type: 'bundle', name: 'm' } })
    const { stream } = await model.doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    })
    const parts = readAll(stream)

    const streamId = streamText.mock.calls.at(-1)![0]
    onStreamUpdate.emit({ streamId, content: 'Hel' })
    onStreamUpdate.emit({ streamId, content: 'Hello' })
    onStreamUpdate.emit({ streamId, content: 'Hello world' })
    onStreamComplete.emit({ streamId })

    const deltas = (await parts)
      .filter((part) => part.type === 'text-delta')
      .map((part) => part.delta)

    expect(deltas).toEqual(['Hel', 'lo', ' world'])
  })
})

const reasoningWarning = {
  type: 'unsupported',
  feature: 'reasoning',
  details: 'Core AI language models do not support configuring reasoning.',
}

function createCallOptions(
  overrides: Partial<LanguageModelV4CallOptions> = {}
): LanguageModelV4CallOptions {
  return {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    ...overrides,
  }
}

describe('core ai language model warnings', () => {
  const model = coreAI({ id: 'model', source: { type: 'bundle', name: 'm' } })

  test('warns that reasoning is unsupported in doGenerate', async () => {
    const result = await model.doGenerate(
      createCallOptions({ reasoning: 'high' })
    )

    expect(result.warnings).toEqual([reasoningWarning])
  })

  test('warns that reasoning is unsupported in doStream', async () => {
    const { stream } = await model.doStream(
      createCallOptions({ reasoning: 'high' })
    )

    const { value } = await stream.getReader().read()
    expect(value).toEqual({
      type: 'stream-start',
      warnings: [reasoningWarning],
    })
  })

  test('does not warn for provider-default reasoning', async () => {
    const result = await model.doGenerate(
      createCallOptions({ reasoning: 'provider-default' })
    )

    expect(result.warnings).toEqual([])
  })
})

describe('reasoning none and tool choice warnings', () => {
  const model = coreAI({ id: 'model', source: { type: 'bundle', name: 'm' } })
  test('does not warn for reasoning none', async () => {
    const result = await model.doGenerate(
      createCallOptions({ reasoning: 'none' })
    )

    expect(result.warnings).toEqual([])
  })
})
