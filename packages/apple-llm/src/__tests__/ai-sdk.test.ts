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
  ): Promise<Record<string, unknown>[]> => [{ type: 'text', text: 'ok' }]
)
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
            cancelStream: () => {},
            onStreamUpdate,
            onStreamComplete,
            onStreamError,
          }
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

  test('requires a tool call for required', async () => {
    await apple().doGenerate(
      createCallOptions({ tools, toolChoice: { type: 'required' } })
    )

    expect(lastNativeOptions().toolCallingMode).toBe('required')
    expect(nativeToolNames()).toEqual(['weather', 'time'])
  })

  test('requires the named tool for a specific tool choice', async () => {
    await apple().doGenerate(
      createCallOptions({
        tools,
        toolChoice: { type: 'tool', toolName: 'time' },
      })
    )

    expect(lastNativeOptions().toolCallingMode).toBe('required')
    expect(nativeToolNames()).toEqual(['time'])
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
    generateText.mockImplementationOnce(async () => [
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
    ])

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

    expect((await parts).filter((part) => part.type !== 'finish')).toEqual([
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
