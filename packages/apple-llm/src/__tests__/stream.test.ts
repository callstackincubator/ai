import { beforeEach, describe, expect, test } from 'bun:test'

import type { AppleMessage } from '../NativeAppleLLM'
import { createFakeEmitter, getAppleLLMStub, readStreamParts } from './mocks'

const { generateStream } = await import('../stream')

let generateStreamCalls: [string, unknown, unknown][]
let cancelStreamCalls: string[]
let updateEmitter: ReturnType<
  typeof createFakeEmitter<{ streamId: string; content: string }>
>
let completeEmitter: ReturnType<typeof createFakeEmitter<{ streamId: string }>>
let errorEmitter: ReturnType<
  typeof createFakeEmitter<{ streamId: string; error: string; code?: string }>
>

beforeEach(() => {
  generateStreamCalls = []
  cancelStreamCalls = []
  updateEmitter = createFakeEmitter()
  completeEmitter = createFakeEmitter()
  errorEmitter = createFakeEmitter()

  Object.assign(getAppleLLMStub(), {
    isAvailable: () => true,
    countTokens: async () => 0,
    generateText: async () => [],
    generateStream: (streamId: string, messages: unknown, options: unknown) => {
      generateStreamCalls.push([streamId, messages, options])
    },
    cancelStream: (streamId: string) => {
      cancelStreamCalls.push(streamId)
    },
    onStreamUpdate: updateEmitter.on,
    onStreamComplete: completeEmitter.on,
    onStreamError: errorEmitter.on,
  })
})

describe('generateStream', () => {
  test('emits every native content payload verbatim as a delta', async () => {
    const messages: AppleMessage[] = [{ role: 'user', content: 'hi' }]
    const stream = generateStream(messages, { temperature: 0.5 })
    const [streamId] = generateStreamCalls[0]

    expect(generateStreamCalls[0][1]).toBe(messages)
    expect(generateStreamCalls[0][2]).toEqual({ temperature: 0.5 })

    updateEmitter.emit({ streamId, content: 'Hello' })
    updateEmitter.emit({ streamId, content: ' world' })
    completeEmitter.emit({ streamId })

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
    ).toEqual(['Hello', ' world'])

    const finish = parts.at(-1) as { finishReason: string }
    expect(finish.finishReason).toBe('stop')
  })

  test('defaults generation options to an empty object', () => {
    const messages: AppleMessage[] = [{ role: 'user', content: 'hi' }]
    generateStream(messages)

    expect(generateStreamCalls[0][2]).toEqual({})
  })

  test('ignores events for other stream ids', async () => {
    const messages: AppleMessage[] = [{ role: 'user', content: 'hi' }]
    const stream = generateStream(messages)
    const [streamId] = generateStreamCalls[0]

    updateEmitter.emit({ streamId: 'other', content: 'ignored' })
    const reader = stream.getReader()
    expect((await reader.read()).value?.type).toBe('text-start')

    const pending = reader.read()
    updateEmitter.emit({ streamId, content: 'kept' })
    expect((await pending).value).toMatchObject({ delta: 'kept' })
  })

  test('maps known codes onto typed errors and closes', async () => {
    const messages: AppleMessage[] = [{ role: 'user', content: 'hi' }]
    const stream = generateStream(messages)
    const [streamId] = generateStreamCalls[0]

    errorEmitter.emit({
      streamId,
      error: 'context too big',
      code: 'CONTEXT_WINDOW_EXCEEDED',
    })

    const parts = await readStreamParts(stream)
    const errorPart = parts.find((part) => part.type === 'error') as {
      error: Error & { code?: string }
    }

    expect(errorPart.error.code).toBe('CONTEXT_WINDOW_EXCEEDED')
    expect(updateEmitter.handlerCount()).toBe(0)
    expect(completeEmitter.handlerCount()).toBe(0)
    expect(errorEmitter.handlerCount()).toBe(0)
  })

  test('cancelling notifies native and detaches listeners', async () => {
    const messages: AppleMessage[] = [{ role: 'user', content: 'hi' }]
    const stream = generateStream(messages)
    const [streamId] = generateStreamCalls[0]

    await stream.cancel()

    expect(cancelStreamCalls).toEqual([streamId])
    expect(updateEmitter.handlerCount()).toBe(0)
  })

  test('wraps native startup failures into a stream error', async () => {
    Object.assign(getAppleLLMStub(), {
      generateStream: () => {
        throw new Error('model unavailable')
      },
    })

    const messages: AppleMessage[] = [{ role: 'user', content: 'hi' }]
    const stream = generateStream(messages)

    await expect(readStreamParts(stream)).rejects.toThrow(
      'Apple LLM stream failed: Error: model unavailable'
    )
    expect(updateEmitter.handlerCount()).toBe(0)
  })
})
