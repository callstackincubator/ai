import type { LanguageModelV4StreamPart } from '@ai-sdk/provider'
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
      streamText,
      cancelStream: () => {},
      onStreamUpdate,
      onStreamComplete,
      onStreamError,
    }),
  },
}))

const { coreAI } = await import('../ai-sdk')

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
