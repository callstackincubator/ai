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

const generateText = mock(
  async (
    _messages: unknown,
    _options: Record<string, unknown>
  ): Promise<Record<string, unknown>> => ({
    content: [{ type: 'text', text: 'ok' }],
  })
)
const countTokens = mock(async (text: string) => text.length)
const generateStream = mock(
  (_streamId: string, _messages: unknown, _options: unknown) => {}
)
const onStreamUpdate = createEmitter()
const onStreamComplete = createEmitter()
const onStreamError = createEmitter()

mock.module('react-native', () => ({
  TurboModuleRegistry: {
    getEnforcing: (name: string) =>
      name === 'NativeAppleLLM'
        ? {
            generateText,
            generateStream,
            countTokens,
            cancelStream: () => {},
            onStreamUpdate,
            onStreamComplete,
            onStreamError,
          }
        : name === 'NativeAppleTranscription'
          ? { prepare: async () => {}, isAvailable: () => true }
          : { getCurrentLocale: () => 'en-US' },
  },
}))

const { apple } = await import('../ai-sdk')

function createCallOptions(
  overrides: Partial<LanguageModelV4CallOptions> = {}
): LanguageModelV4CallOptions {
  return {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    ...overrides,
  }
}

function lastNativeOptions() {
  return generateText.mock.calls.at(-1)![1]
}

beforeEach(() => {
  generateText.mockClear()
})

describe('apple language model', () => {
  test('forwards the reasoning call option as reasoningLevel', async () => {
    await apple().doGenerate(createCallOptions({ reasoning: 'high' }))

    expect(lastNativeOptions().providerOptions).toMatchObject({
      reasoningLevel: 'deep',
    })
  })

  test('does not set reasoningLevel for provider-default reasoning', async () => {
    await apple().doGenerate(
      createCallOptions({ reasoning: 'provider-default' })
    )

    expect(
      (lastNativeOptions().providerOptions as Record<string, unknown>)
        .reasoningLevel
    ).toBeUndefined()
  })
})

describe('apple prompt conversion', () => {
  test('replays assistant turns as structured parts', async () => {
    await apple().doGenerate(
      createCallOptions({
        prompt: [
          { role: 'user', content: [{ type: 'text', text: 'weather?' }] },
          {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'apple thinking',
                providerOptions: { apple: { signature: 'c2ln' } },
              },
              { type: 'reasoning', text: 'other model thinking' },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'weather',
                input: { city: 'Paris' },
              },
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'weather',
                output: { type: 'json', value: { forecast: 'sunny' } },
              },
              { type: 'text', text: 'It is sunny' },
            ],
          },
          { role: 'user', content: [{ type: 'text', text: 'thanks' }] },
        ],
      })
    )

    expect(generateText.mock.calls.at(-1)![0]).toEqual([
      { role: 'user', content: 'weather?', attachments: [] },
      {
        role: 'assistant',
        content: 'It is sunny',
        parts: [
          { type: 'reasoning', text: 'apple thinking', signature: 'c2ln' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'weather',
            input: '{"city":"Paris"}',
          },
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'weather',
            output: '{"forecast":"sunny"}',
          },
          { type: 'text', text: 'It is sunny' },
        ],
      },
      { role: 'user', content: 'thanks', attachments: [] },
    ])
  })

  test('replays tool messages and skips tool approval responses', async () => {
    await apple().doGenerate(
      createCallOptions({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-approval-response',
                approvalId: 'approval-1',
                approved: true,
              },
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'weather',
                output: { type: 'text', value: 'sunny' },
              },
              {
                type: 'tool-result',
                toolCallId: 'call-2',
                toolName: 'delete',
                output: { type: 'execution-denied', reason: 'Not allowed' },
              },
            ],
          },
          { role: 'user', content: [{ type: 'text', text: 'ok' }] },
        ],
      })
    )

    expect(generateText.mock.calls.at(-1)![0]).toEqual([
      {
        role: 'tool',
        content: '',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'weather',
            output: 'sunny',
          },
          {
            type: 'tool-result',
            toolCallId: 'call-2',
            toolName: 'delete',
            output: 'Not allowed',
          },
        ],
      },
      { role: 'user', content: 'ok', attachments: [] },
    ])
  })
})

describe('apple image history', () => {
  test('keeps image attachments only on the final user prompt', async () => {
    const image = {
      type: 'file' as const,
      mediaType: 'image/png',
      data: { type: 'data' as const, data: 'iVBORw0KGgo=' },
    }

    await apple().doGenerate(
      createCallOptions({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'what is this?' }, image],
          },
          { role: 'assistant', content: [{ type: 'text', text: 'A cat.' }] },
          {
            role: 'user',
            content: [{ type: 'text', text: 'and this?' }, image],
          },
        ],
      })
    )

    const [first, , last] = generateText.mock.calls.at(-1)![0] as {
      attachments: unknown[]
    }[]
    expect(first.attachments).toEqual([])
    expect(last.attachments).toHaveLength(1)
  })
})

describe('apple image urls', () => {
  test('passes local file image urls through instead of downloading them', async () => {
    const { generateText: generate } = await import('ai')

    await generate({
      model: apple(),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'what is this?' },
            { type: 'image', image: new URL('file:///tmp/photo.jpg') },
          ],
        },
      ],
    })

    const [message] = generateText.mock.calls.at(-1)![0] as {
      attachments: unknown[]
    }[]
    expect(message.attachments).toEqual([
      expect.objectContaining({ url: 'file:///tmp/photo.jpg' }),
    ])
  })
})

describe('apple tool choice', () => {
  const tools: LanguageModelV4CallOptions['tools'] = [
    {
      type: 'function',
      name: 'weather',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      type: 'function',
      name: 'time',
      inputSchema: { type: 'object', properties: {} },
    },
  ]

  function nativeToolNames() {
    return (lastNativeOptions().tools as { name: string }[]).map(
      (tool) => tool.name
    )
  }

  test('keeps the default tool calling mode for auto', async () => {
    await apple().doGenerate(
      createCallOptions({ tools, toolChoice: { type: 'auto' } })
    )

    expect(lastNativeOptions().toolCallingMode).toBeUndefined()
    expect(nativeToolNames()).toEqual(['weather', 'time'])
  })

  test('disallows tool calls for none', async () => {
    await apple().doGenerate(
      createCallOptions({ tools, toolChoice: { type: 'none' } })
    )

    expect(lastNativeOptions().toolCallingMode).toBe('disallowed')
    expect(nativeToolNames()).toEqual([])
  })

  // Apple runs tools natively in a loop, and the required mode applies to
  // every step of it, so forcing a call never lets the model answer
  const requiredWarning = {
    type: 'unsupported',
    feature: 'toolChoice',
    details:
      'Apple Foundation Models run tools natively and cannot be required to call a tool.',
  }

  test('warns that required tool choice is unsupported', async () => {
    const result = await apple().doGenerate(
      createCallOptions({ tools, toolChoice: { type: 'required' } })
    )

    expect(lastNativeOptions().toolCallingMode).toBeUndefined()
    expect(nativeToolNames()).toEqual(['weather', 'time'])
    expect(result.warnings).toEqual([requiredWarning])
  })

  test('narrows tools for a specific tool choice', async () => {
    const result = await apple().doGenerate(
      createCallOptions({
        tools,
        toolChoice: { type: 'tool', toolName: 'time' },
      })
    )

    expect(lastNativeOptions().toolCallingMode).toBeUndefined()
    expect(nativeToolNames()).toEqual(['time'])
    expect(result.warnings).toEqual([requiredWarning])
  })

  test('reports tool choice warnings in stream-start', async () => {
    const { stream } = await apple().doStream(
      createCallOptions({ tools, toolChoice: { type: 'required' } })
    )

    const { value } = await stream.getReader().read()
    expect(value).toEqual({ type: 'stream-start', warnings: [requiredWarning] })
  })
})

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

describe('apple generated content', () => {
  test('returns reasoning and tool parts with their ids', async () => {
    generateText.mockImplementationOnce(async () => ({
      content: [
        { type: 'reasoning', id: 'r1', text: 'thinking', signature: 'c2ln' },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'weather',
          input: '{"city":"Paris"}',
        },
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'weather',
          output: 'sunny',
        },
        { type: 'text', text: 'It is sunny' },
      ],
    }))

    const result = await apple().doGenerate(createCallOptions())

    expect(result.content).toEqual([
      {
        type: 'reasoning',
        text: 'thinking',
        providerMetadata: { apple: { signature: 'c2ln' } },
      },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        providerExecuted: true,
        toolName: 'weather',
        input: '{"city":"Paris"}',
      },
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        providerExecuted: true,
        toolName: 'weather',
        result: 'sunny',
      },
      { type: 'text', text: 'It is sunny' },
    ])
  })

  test('streams reasoning, tool and text parts', async () => {
    const { stream } = await apple().doStream(createCallOptions())
    const parts = readAll(stream)
    const streamId = generateStream.mock.calls.at(-1)![0]

    const reasoning = { type: 'reasoning', id: 'r1', text: 'Let' }
    const toolCall = {
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'weather',
      input: '{"city":"Paris"}',
    }
    const toolResult = {
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'weather',
      output: 'sunny',
    }

    onStreamUpdate.emit({ streamId, content: '', entries: [reasoning] })
    onStreamUpdate.emit({
      streamId,
      content: '',
      entries: [{ ...reasoning, text: 'Let me check', signature: 'c2ln' }],
    })
    onStreamUpdate.emit({
      streamId,
      content: '',
      entries: [{ ...reasoning, text: 'Let me check' }, toolCall],
    })
    onStreamUpdate.emit({
      streamId,
      content: '',
      entries: [{ ...reasoning, text: 'Let me check' }, toolCall, toolResult],
    })
    onStreamUpdate.emit({ streamId, content: 'It is' })
    onStreamUpdate.emit({ streamId, content: 'It is sunny' })
    onStreamComplete.emit({ streamId })

    expect(
      (await parts).filter(
        (part) => part.type !== 'stream-start' && part.type !== 'finish'
      )
    ).toEqual([
      { type: 'reasoning-start', id: 'r1' },
      { type: 'reasoning-delta', id: 'r1', delta: 'Let' },
      { type: 'reasoning-delta', id: 'r1', delta: ' me check' },
      {
        type: 'reasoning-end',
        id: 'r1',
        providerMetadata: { apple: { signature: 'c2ln' } },
      },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: '{"city":"Paris"}',
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'weather',
        result: 'sunny',
      },
      { type: 'text-start', id: streamId },
      { type: 'text-delta', id: streamId, delta: 'It is' },
      { type: 'text-delta', id: streamId, delta: ' sunny' },
      { type: 'text-end', id: streamId },
    ])
  })
})

describe('apple usage', () => {
  test('maps native token usage', async () => {
    generateText.mockImplementationOnce(async () => ({
      content: [{ type: 'text', text: 'ok' }],
      usage: {
        inputTokens: 120,
        cachedInputTokens: 20,
        outputTokens: 30,
        reasoningTokens: 10,
      },
    }))

    const result = await apple().doGenerate(createCallOptions())

    expect(result.usage).toEqual({
      inputTokens: {
        total: 120,
        noCache: 100,
        cacheRead: 20,
        cacheWrite: undefined,
      },
      outputTokens: { total: 30, text: 20, reasoning: 10 },
    })
  })

  test('reports unknown usage as undefined instead of zero', async () => {
    const result = await apple().doGenerate(createCallOptions())

    expect(result.usage).toEqual({
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    })
  })

  test('reports stream usage on finish', async () => {
    const { stream } = await apple().doStream(createCallOptions())
    const parts = readAll(stream)
    const streamId = generateStream.mock.calls.at(-1)![0]

    onStreamUpdate.emit({ streamId, content: 'ok' })
    onStreamComplete.emit({
      streamId,
      usage: { inputTokens: 12, outputTokens: 3 },
    })

    const finish = (await parts).find((part) => part.type === 'finish')
    expect(finish).toMatchObject({
      usage: {
        inputTokens: { total: 12, noCache: undefined, cacheRead: undefined },
        outputTokens: { total: 3, text: undefined, reasoning: undefined },
      },
    })
  })
})

describe('apple structured output stream', () => {
  test('sends the final json once the stream completes', async () => {
    const { stream } = await apple().doStream(
      createCallOptions({
        responseFormat: {
          type: 'json',
          schema: { type: 'object', properties: { city: { type: 'string' } } },
        },
      })
    )
    const parts = readAll(stream)
    const streamId = generateStream.mock.calls.at(-1)![0]

    onStreamUpdate.emit({ streamId, content: '{"city":"Par"}' })
    onStreamUpdate.emit({ streamId, content: '{"city":"Paris"}' })
    onStreamComplete.emit({ streamId })

    expect(
      (await parts).filter(
        (part) => part.type !== 'stream-start' && part.type !== 'finish'
      )
    ).toEqual([
      { type: 'text-start', id: streamId },
      { type: 'text-delta', id: streamId, delta: '{"city":"Paris"}' },
      { type: 'text-end', id: streamId },
    ])
  })
})

describe('apple with the ai sdk', () => {
  test('streams structured output and usage through streamText', async () => {
    const { jsonSchema, Output, streamText } = await import('ai')
    generateStream.mockImplementationOnce((streamId) => {
      setTimeout(() => {
        onStreamUpdate.emit({ streamId, content: '{"city":"Par"}' })
        onStreamUpdate.emit({ streamId, content: '{"city":"Paris"}' })
        onStreamComplete.emit({
          streamId,
          usage: { inputTokens: 40, outputTokens: 6 },
        })
      })
    })

    const result = streamText({
      model: apple(),
      prompt: 'Where is the Eiffel Tower?',
      output: Output.object({
        schema: jsonSchema<{ city: string }>({
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        }),
      }),
    })

    expect(await result.output).toEqual({ city: 'Paris' })
    expect(await result.usage).toMatchObject({
      inputTokens: 40,
      outputTokens: 6,
      totalTokens: 46,
    })
  })
})

describe('apple token counting', () => {
  test('counts tokens through the language model', async () => {
    expect(await apple().countTokens('hello')).toBe(5)
    expect(countTokens).toHaveBeenCalledWith('hello')
  })
})

describe('apple transcription', () => {
  test('sends only the bytes of a typed array view', async () => {
    const transcribe = mock(
      async (_data: ArrayBufferLike, _language: string) => ({
        segments: [],
        duration: 0,
      })
    )
    globalThis.__apple__llm__transcribe__ = transcribe

    const model = apple.transcriptionModel()
    await model.prepare()
    const audio = new Uint8Array([0, 1, 2, 3, 4, 5]).subarray(2, 4)
    await model.doGenerate({ audio, mediaType: 'audio/wav' })

    const sent = new Uint8Array(transcribe.mock.calls[0]![0])
    expect([...sent]).toEqual([2, 3])
  })
})
