import type {
  LanguageModelV3CallOptions,
  LanguageModelV3FunctionTool,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider'
import { jsonSchema } from '@ai-sdk/provider-utils'
import { beforeEach, describe, expect, test } from 'bun:test'

import type {
  AdkAgentConfig,
  AdkGenerationOptions,
  AdkMessage,
  AdkTool,
} from '../NativeAdkEngine'
import {
  captureWarnings,
  createFakeEmitter,
  getAdkStub,
  readStreamParts,
} from './mocks'

const { createAdkProvider } = await import('../ai-sdk')

let generateTextCalls: [
  string,
  AdkMessage[],
  AdkAgentConfig,
  AdkGenerationOptions,
  AdkTool[],
][]
let generateTextImpl: () => Promise<{
  role: 'assistant'
  content: string
  finishReason?: string
  usage?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}>
let streamTextCalls: [string, AdkMessage[], AdkAgentConfig][]
let cancelStreamCalls: string[]
let submittedToolResults: [string, string][]
let isAvailableImpl: (modelType: string) => Promise<boolean>
let isNanoSupportedImpl: () => Promise<boolean>
let prepareNanoCalls: number
let updateEmitter: ReturnType<
  typeof createFakeEmitter<{ streamId: string; delta: string }>
>
let completeEmitter: ReturnType<
  typeof createFakeEmitter<{
    streamId: string
    finishReason?: string
    usage?: Record<string, number>
  }>
>
let errorEmitter: ReturnType<
  typeof createFakeEmitter<{ streamId: string; error: string }>
>
let toolCallEmitter: ReturnType<
  typeof createFakeEmitter<{
    streamId: string
    phase: 'start' | 'delta' | 'end'
    toolCallId: string
    toolName?: string
    inputDelta?: string
    input?: string
  }>
>
let toolCallEmitterGlobal: ReturnType<
  typeof createFakeEmitter<{
    toolCallId: string
    toolId: string
    arguments: string
    streamId?: string
    runId?: string
  }>
>

function installNativeStub() {
  generateTextCalls = []
  streamTextCalls = []
  cancelStreamCalls = []
  submittedToolResults = []
  prepareNanoCalls = 0
  isAvailableImpl = async () => true
  isNanoSupportedImpl = async () => true
  updateEmitter = createFakeEmitter()
  completeEmitter = createFakeEmitter()
  errorEmitter = createFakeEmitter()
  toolCallEmitter = createFakeEmitter()
  toolCallEmitterGlobal = createFakeEmitter()

  generateTextImpl = async () => ({
    role: 'assistant',
    content: 'native answer',
    finishReason: 'STOP',
  })

  Object.assign(getAdkStub(), {
    isAvailable: (modelType: string) => isAvailableImpl(modelType),
    isNanoSupported: () => isNanoSupportedImpl(),
    prepareNano: async () => {
      prepareNanoCalls += 1
    },
    generateText: async (
      runId: string,
      messages: AdkMessage[],
      config: AdkAgentConfig,
      options: AdkGenerationOptions,
      tools: AdkTool[]
    ) => {
      generateTextCalls.push([runId, messages, config, options, tools])
      return generateTextImpl()
    },
    streamText: async (
      streamId: string,
      messages: AdkMessage[],
      config: AdkAgentConfig
    ) => {
      streamTextCalls.push([streamId, messages, config])
    },
    cancelStream: async (streamId: string) => {
      cancelStreamCalls.push(streamId)
    },
    submitToolResult: (toolCallId: string, result: string) => {
      submittedToolResults.push([toolCallId, result])
    },
    onStreamUpdate: updateEmitter.on,
    onStreamComplete: completeEmitter.on,
    onStreamError: errorEmitter.on,
    onStreamToolCall: toolCallEmitter.on,
    onToolCall: toolCallEmitterGlobal.on,
  })
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
function functionTool(
  name: string,
  inputSchema: Record<string, unknown> = { type: 'object', properties: {} }
): LanguageModelV3FunctionTool {
  return {
    type: 'function',
    name,
    inputSchema,
  } as unknown as LanguageModelV3FunctionTool
}
function callOptions(
  overrides: Partial<LanguageModelV3CallOptions> = {}
): LanguageModelV3CallOptions {
  return {
    prompt: [
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ] as LanguageModelV3Prompt,
    inputFormat: 'messages',
    mode: { type: 'regular' },
    ...overrides,
  } as LanguageModelV3CallOptions
}
beforeEach(() => {
  installNativeStub()
  globalThis.__ADK_TOOLS__ = {}
})
describe('provider factory', () => {
  test('isNanoSupported resolves through the native engine', async () => {
    isNanoSupportedImpl = async () => false

    expect(await createAdkProvider().isNanoSupported()).toBe(false)
  })
  test('isAvailable checks nano support before model availability for nano', async () => {
    let isAvailableCalls: string[] = []
    isAvailableImpl = async (modelType) => {
      isAvailableCalls.push(modelType)
      return true
    }
    isNanoSupportedImpl = async () => false
    const provider = createAdkProvider()
    expect(await provider.isAvailable('genai-nano')).toBe(false)
    expect(isAvailableCalls).toEqual([])
    isNanoSupportedImpl = async () => true
    expect(await provider.isAvailable('genai-nano')).toBe(true)
    expect(isAvailableCalls).toEqual(['genai-nano'])

    isNanoSupportedImpl = async () => false
    expect(await provider.isAvailable('gemini')).toBe(true)
    expect(isAvailableCalls).toEqual(['genai-nano', 'gemini'])
  })
  test('prepareNano delegates to the native engine', async () => {
    await createAdkProvider().prepareNano()
    expect(prepareNanoCalls).toBe(1)
  })
  test('defaults the agent config from provider options', async () => {
    await createAdkProvider()().doGenerate(callOptions())
    const [, , config] = generateTextCalls[0]
    expect(config).toEqual({
      name: 'react_native_adk_agent',
      description: 'React Native ADK agent',
      instruction: undefined,
      model: { type: 'genai-nano', name: 'gemini-nano', apiKey: undefined },
    })
  })
  test('honours explicit provider options', async () => {
    const model = createAdkProvider({
      name: 'my-agent',
      description: 'says hi',
      instruction: 'be nice',
      modelType: 'gemini',
      modelName: 'gemini-2.5-flash',
      apiKey: 'secret',
    })()
    expect(model.modelId).toBe('gemini-2.5-flash')
    await model.doGenerate(callOptions())
    expect(generateTextCalls[0][2]).toEqual({
      name: 'my-agent',
      description: 'says hi',
      instruction: 'be nice',
      model: { type: 'gemini', name: 'gemini-2.5-flash', apiKey: 'secret' },
    })
  })
})
describe('nano preparation', () => {
  test('fails fast when the device cannot run Gemini Nano', async () => {
    isNanoSupportedImpl = async () => false

    await expect(
      createAdkProvider()().doGenerate(callOptions())
    ).rejects.toThrow('Gemini Nano is not supported on this device')
  })
  test('prepares nano once and caches the promise', async () => {
    const model = createAdkProvider()()
    await model.doGenerate(callOptions())
    await model.doGenerate(callOptions())
    expect(prepareNanoCalls).toBe(1)
  })
  test('retries preparation after a failure', async () => {
    let shouldFail = true
    let attempts = 0
    Object.assign(getAdkStub(), {
      prepareNano: async () => {
        attempts += 1
        if (shouldFail) {
          shouldFail = false
          throw new Error('download interrupted')
        }
      },
    })
    const model = createAdkProvider()()
    await expect(model.doGenerate(callOptions())).rejects.toThrow(
      'download interrupted'
    )
    await model.doGenerate(callOptions())
    expect(attempts).toBe(2)
  })

  test('skips nano preparation for cloud models', async () => {
    await createAdkProvider({ modelType: 'gemini' })().doGenerate(callOptions())
    expect(prepareNanoCalls).toBe(0)
  })
})

describe('prompt conversion', () => {
  test('passes system messages through', async () => {
    await createAdkProvider()().doGenerate(
      callOptions({
        prompt: [
          { role: 'system', content: 'be brief' },
          {
            role: 'user',
            content: [{ type: 'text', text: 'hi' }],
          },
        ] as LanguageModelV3Prompt,
      })
    )
    expect(generateTextCalls[0][1]).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
    ])
  })
  test('uses plain content for single-text user messages', async () => {
    await createAdkProvider()().doGenerate(
      callOptions({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'just one' }],
          },
        ] as LanguageModelV3Prompt,
      })
    )
    expect(generateTextCalls[0][1]).toEqual([
      { role: 'user', content: 'just one' },
    ])
  })
  test('keeps multi-part user messages as parts and drops unsupported ones', async () => {
    const { warnings } = await captureWarnings(async () => {
      await createAdkProvider()().doGenerate(
        callOptions({
          prompt: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'look' },
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: 'aGVsbG8=',
                },
                { type: 'reasoning', text: 'ignored' },
              ],
            },
          ] as LanguageModelV3Prompt,
        })
      )
    })
    expect(generateTextCalls[0][1]).toEqual([
      {
        role: 'user',
        parts: [
          { type: 'text', text: 'look' },
          { type: 'file', mimeType: 'image/png', data: 'aGVsbG8=' },
        ],
      },
    ])
    expect(warnings).toHaveLength(1)
  })
  test('strips data-url prefixes from base64 file parts', async () => {
    await createAdkProvider()().doGenerate(
      callOptions({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'a' },
              {
                type: 'file',
                mediaType: 'audio/wav',
                data: 'data:audio/wav;base64,QUJD',
              },
            ],
          },
        ] as LanguageModelV3Prompt,
      })
    )
    expect(generateTextCalls[0][1][0].parts?.[1]).toEqual({
      type: 'file',
      mimeType: 'audio/wav',
      data: 'QUJD',
    })
  })
  test('encodes Uint8Array file parts as base64', async () => {
    await createAdkProvider()().doGenerate(
      callOptions({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'a' },
              {
                type: 'file',
                mediaType: 'image/png',
                data: new Uint8Array([65, 66, 67]),
              },
            ],
          },
        ] as LanguageModelV3Prompt,
      })
    )
    expect(generateTextCalls[0][1][0].parts?.[1]).toEqual({
      type: 'file',
      mimeType: 'image/png',
      data: 'QUJD',
    })
  })
  test('rejects file URLs', async () => {
    await expect(
      createAdkProvider()().doGenerate(
        callOptions({
          prompt: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'a' },
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: new URL('https://example.com/a.png'),
                },
              ],
            },
          ] as LanguageModelV3Prompt,
        })
      )
    ).rejects.toThrow('ADK wrapper does not support file URLs yet')
  })
  test('concatenates assistant text parts', async () => {
    await createAdkProvider()().doGenerate(
      callOptions({
        prompt: [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'one ' },
              { type: 'text', text: 'two' },
            ],
          },
        ] as LanguageModelV3Prompt,
      })
    )
    expect(generateTextCalls[0][1]).toEqual([
      { role: 'assistant', content: 'one two' },
    ])
  })
  test('rewrites tool results into user messages', async () => {
    await createAdkProvider()().doGenerate(
      callOptions({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'lookup',
                output: { type: 'json', value: { found: true } },
              },
              {
                type: 'tool-result',
                toolCallId: 'call-2',
                toolName: 'lookup',
                output: { type: 'text', value: 'plain' },
              },
              {
                type: 'tool-result',
                toolCallId: 'call-3',
                toolName: 'lookup',
                output: { type: 'execution-denied', reason: 'user said no' },
              },
              {
                type: 'tool-result',
                toolCallId: 'call-4',
                toolName: 'lookup',
                output: { type: 'execution-denied' },
              },
            ],
          },
        ] as LanguageModelV3Prompt,
      })
    )
    expect(generateTextCalls[0][1]).toEqual([
      {
        role: 'user',
        content: '{"found":true}\nplain\nuser said no\nExecution denied',
      },
    ])
  })
  test('rejects unsupported roles', async () => {
    await expect(
      createAdkProvider()().doGenerate(
        callOptions({
          prompt: [
            { role: 'developer', content: 'nope' },
          ] as unknown as LanguageModelV3Prompt,
        })
      )
    ).rejects.toThrow('Unsupported message role for ADK provider')
  })
})
describe('generation option mapping', () => {
  test('maps sampling options', async () => {
    await createAdkProvider()().doGenerate(
      callOptions({
        temperature: 0.3,
        maxOutputTokens: 256,
        topP: 0.7,
        topK: 5,
      })
    )
    expect(generateTextCalls[0][3]).toEqual({
      temperature: 0.3,
      maxTokens: 256,
      topP: 0.7,
      topK: 5,
      responseFormat: undefined,
    })
  })
  test('maps schemaless json mode to an application/json response format', async () => {
    await createAdkProvider()().doGenerate(
      callOptions({ responseFormat: { type: 'json' } })
    )
    expect(generateTextCalls[0][3].responseFormat).toEqual({
      type: 'json',
      mimeType: 'application/json',
    })
  })
  test('rejects json mode with a schema', async () => {
    await expect(
      createAdkProvider()().doGenerate(
        callOptions({
          responseFormat: { type: 'json', schema: { type: 'object' } },
        })
      )
    ).rejects.toThrow('ADK does not support responseFormat.schema yet')
  })
  test('warns that required toolChoice falls back to auto', async () => {
    const { warnings } = await captureWarnings(async () => {
      await createAdkProvider()().doGenerate(
        callOptions({ toolChoice: { type: 'required' } })
      )
    })
    expect(
      warnings.some((args) => String(args[0]).includes('toolChoice'))
    ).toBe(true)
  })
})
describe('tool mapping', () => {
  test('converts input schema properties into ADK parameters', async () => {
    await createAdkProvider()().doGenerate(
      callOptions({
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Lookup weather',
            inputSchema: {
              type: 'object',
              properties: {
                city: { type: 'string', description: 'City name' },
                days: { type: 'number' },
                secret: { type: 'boolean' },
              },
              required: ['city'],
            },
          },
          {
            type: 'provider',
            id: 'browser.search',
            name: 'browser.search',
            args: {},
          },
        ],
      })
    )
    const tools = generateTextCalls[0][4]
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      name: 'get_weather',
      description: 'Lookup weather',
      parameters: [
        {
          name: 'city',
          description: 'City name',
          type: 'string',
          required: true,
        },
        {
          name: 'days',
          description: undefined,
          type: 'number',
          required: false,
        },
        {
          name: 'secret',
          description: undefined,
          type: 'boolean',
          required: false,
        },
      ],
    })
    expect(typeof tools[0].id).toBe('string')
  })
  test('defaults missing schema types to string', async () => {
    await createAdkProvider()().doGenerate(
      callOptions({
        tools: [
          {
            type: 'function',
            name: 'no_schema',
            inputSchema: {
              type: 'object',
              properties: { anything: {} },
            },
          },
        ],
      })
    )
    expect(generateTextCalls[0][4][0].parameters).toEqual([
      {
        name: 'anything',
        description: undefined,
        type: 'string',
        required: false,
      },
    ])
  })
  test('registers and unregisters executors around the call', async () => {
    let registeredDuringCall: string[] = []
    generateTextImpl = async () => {
      registeredDuringCall = Object.keys(globalThis.__ADK_TOOLS__ ?? {})
      return { role: 'assistant', content: 'ok', finishReason: 'STOP' }
    }
    await createAdkProvider({
      availableTools: {
        get_weather: {
          type: 'function',
          inputSchema: jsonSchema({
            type: 'object',
            properties: { city: { type: 'string' } },
          }),
          execute: async (args: unknown) => ({ city: args }),
        },
      },
    })().doGenerate(
      callOptions({
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            inputSchema: {
              type: 'object',
              properties: { city: { type: 'string' } },
            },
          },
        ],
      })
    )
    expect(registeredDuringCall).toHaveLength(1)
    expect(Object.keys(globalThis.__ADK_TOOLS__ ?? {})).toEqual([])
  })
})
describe('native tool call dispatch', () => {
  const weatherTool = functionTool('get_weather', {
    type: 'object',
    properties: { city: { type: 'string' } },
  })
  test('executes registered tools and submits stringified results', async () => {
    let streamId = ''
    const model = createAdkProvider({
      availableTools: {
        get_weather: {
          type: 'function',
          inputSchema: jsonSchema({
            type: 'object',
            properties: { city: { type: 'string' } },
          }),
          execute: async ({ city }: { city: string }) => `sunny in ${city}`,
        },
      },
    })()
    const { stream } = await model.doStream(
      callOptions({ tools: [weatherTool] })
    )
    await tick()
    ;[streamId] = streamTextCalls[0]
    const collected = readStreamParts(stream)
    const toolId = Object.keys(globalThis.__ADK_TOOLS__ ?? {})[0]
    expect(toolId).toBeDefined()
    toolCallEmitterGlobal.emit({
      toolCallId: 'invoke-1',
      toolId,
      arguments: '{"city":"NYC"}',
      streamId,
    })
    await tick()
    expect(submittedToolResults).toEqual([['invoke-1', 'sunny in NYC']])

    delete globalThis.__ADK_TOOLS__[toolId]
    toolCallEmitterGlobal.emit({
      toolCallId: 'invoke-2',
      toolId,
      arguments: '{}',
      streamId,
    })
    await tick()
    expect(submittedToolResults[1]).toEqual([
      'invoke-2',
      JSON.stringify({ error: `Tool not found: ${toolId}` }),
    ])
    completeEmitter.emit({ streamId })
    await collected
  })

  test('submits error payloads when an executor throws', async () => {
    const model = createAdkProvider({
      availableTools: {
        boom: {
          type: 'function',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
          execute: async () => {
            throw new Error('tool exploded')
          },
        },
      },
    })()
    const { stream } = await model.doStream(
      callOptions({
        tools: [functionTool('boom')],
      })
    )
    const collected = readStreamParts(stream)
    await tick()
    const [streamId] = streamTextCalls[0]
    const toolId = Object.keys(globalThis.__ADK_TOOLS__ ?? {})[0]
    expect(toolId).toBeDefined()
    toolCallEmitterGlobal.emit({
      toolCallId: 'invoke-3',
      toolId,
      arguments: '{}',
      streamId,
    })
    await tick()
    expect(submittedToolResults).toEqual([
      ['invoke-3', JSON.stringify({ error: 'tool exploded' })],
    ])

    completeEmitter.emit({ streamId })
    await collected
  })

  test('ignores tool calls from other streams and foreign tool ids', async () => {
    const model = createAdkProvider({
      availableTools: {
        get_weather: {
          type: 'function',
          inputSchema: jsonSchema({ type: 'object', properties: {} }),
          execute: async () => 'ok',
        },
      },
    })()
    const { stream } = await model.doStream(
      callOptions({
        tools: [functionTool('get_weather')],
      })
    )
    const collected = readStreamParts(stream)
    await tick()
    const [streamId] = streamTextCalls[0]
    const toolId = Object.keys(globalThis.__ADK_TOOLS__ ?? {})[0]
    expect(toolId).toBeDefined()
    toolCallEmitterGlobal.emit({
      toolCallId: 'other-stream',
      toolId,
      arguments: '{}',
      streamId: 'someone-elses-stream',
    })
    toolCallEmitterGlobal.emit({
      toolCallId: 'foreign-tool',
      toolId: 'not-mine',
      arguments: '{}',
      streamId,
    })
    await tick()
    expect(submittedToolResults).toEqual([])
    completeEmitter.emit({ streamId })
    await collected
  })
})
describe('doGenerate response mapping', () => {
  test('normalizes finish reasons and usage', async () => {
    generateTextImpl = async () => ({
      role: 'assistant',
      content: 'sure',
      finishReason: 'MAX_TOKENS',
      usage: {
        promptTokenCount: 10,
        candidatesTokenCount: 4,
        totalTokenCount: 14,
      },
    })
    const result = await createAdkProvider()().doGenerate(callOptions())
    expect(result.content).toEqual([{ type: 'text', text: 'sure' }])
    expect(result.finishReason).toEqual({
      unified: 'length',
      raw: 'MAX_TOKENS',
    })
    expect(result.usage.inputTokens.total).toBe(10)
    expect(result.usage.outputTokens.total).toBe(4)
    expect(result.usage.raw).toEqual({
      promptTokenCount: 10,
      candidatesTokenCount: 4,
      totalTokenCount: 14,
    })
  })
  test('maps lowercase and tool-call finish reasons, defaulting to other', async () => {
    const model = createAdkProvider()()
    for (const [raw, unified] of [
      ['stop', 'stop'],
      ['STOP', 'stop'],
      ['length', 'length'],
      ['tool_calls', 'tool-calls'],
      ['TOOL_CALLS', 'tool-calls'],
      ['content_filter', 'other'],
      [undefined, 'other'],
    ] as const) {
      generateTextImpl = async () => ({
        role: 'assistant',
        content: 'x',
        finishReason: raw,
      })
      expect((await model.doGenerate(callOptions())).finishReason).toEqual({
        unified,
        raw,
      })
    }
  })
  test('produces an empty usage object when the native response has none', async () => {
    const result = await createAdkProvider()().doGenerate(callOptions())
    expect(result.usage.inputTokens.total).toBeUndefined()
    expect(result.usage.outputTokens.total).toBeUndefined()
    expect(result.usage.raw).toBeUndefined()
  })
})
describe('doStream', () => {
  test('rejects streaming json responses', async () => {
    await expect(
      createAdkProvider()().doStream(
        callOptions({ responseFormat: { type: 'json' } })
      )
    ).rejects.toThrow('Streaming JSON responses is not yet supported by ADK.')
  })
  test('translates stream events into AI SDK parts', async () => {
    const model = createAdkProvider()()
    const { stream } = await model.doStream(callOptions())
    await tick()
    const [streamId] = streamTextCalls[0]
    updateEmitter.emit({ streamId, delta: 'He' })
    updateEmitter.emit({ streamId, delta: '' })
    updateEmitter.emit({ streamId: 'other', delta: 'ignored' })
    updateEmitter.emit({ streamId, delta: 'llo' })
    completeEmitter.emit({ streamId, finishReason: 'STOP' })
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
    ).toEqual(['He', 'llo'])
  })
  test('translates tool call phases', async () => {
    const model = createAdkProvider()()
    const { stream } = await model.doStream(callOptions())
    await tick()
    const [streamId] = streamTextCalls[0]
    toolCallEmitter.emit({
      streamId,
      phase: 'start',
      toolCallId: 'tc-1',
      toolName: 'get_weather',
    })
    toolCallEmitter.emit({
      streamId,
      phase: 'delta',
      toolCallId: 'tc-1',
      inputDelta: '{"city":',
    })
    toolCallEmitter.emit({
      streamId,
      phase: 'end',
      toolCallId: 'tc-1',
      toolName: 'get_weather',
      input: '{"city":"NYC"}',
    })
    toolCallEmitter.emit({ streamId, phase: 'end', toolCallId: 'tc-2' })
    completeEmitter.emit({ streamId })
    const parts = await readStreamParts(stream)
    expect(parts.map((part) => part.type)).toEqual([
      'text-start',
      'tool-input-start',
      'tool-input-delta',
      'tool-input-end',
      'tool-call',
      'text-end',
      'finish',
    ])
    expect(parts[1]).toEqual({
      type: 'tool-input-start',
      id: 'tc-1',
      toolName: 'get_weather',
      providerExecuted: true,
    })
    expect(parts[4]).toEqual({
      type: 'tool-call',
      toolCallId: 'tc-1',
      toolName: 'get_weather',
      input: '{"city":"NYC"}',
      providerExecuted: true,
    })
  })
  test('emits errors as stream parts and cleans up', async () => {
    const model = createAdkProvider()()
    const { stream } = await model.doStream(callOptions())
    await tick()
    const [streamId] = streamTextCalls[0]
    errorEmitter.emit({ streamId, error: 'upstream failed' })
    const parts = await readStreamParts(stream)
    const errorPart = parts.find((part) => part.type === 'error') as {
      error: Error
    }
    expect(errorPart.error.message).toBe('upstream failed')
    expect(updateEmitter.handlerCount()).toBe(0)
    expect(completeEmitter.handlerCount()).toBe(0)
    expect(toolCallEmitter.handlerCount()).toBe(0)
    expect(toolCallEmitterGlobal.handlerCount()).toBe(0)
    expect(Object.keys(globalThis.__ADK_TOOLS__ ?? {})).toEqual([])
  })
  test('cancellation cancels natively and is idempotent', async () => {
    const model = createAdkProvider()()
    const { stream } = await model.doStream(callOptions())
    await tick()
    const [streamId] = streamTextCalls[0]
    await stream.cancel()
    await stream.cancel().catch(() => undefined)
    expect(cancelStreamCalls).toEqual([streamId])
    expect(updateEmitter.handlerCount()).toBe(0)
  })

  test('wraps native preparation failures into the stream', async () => {
    isNanoSupportedImpl = async () => false
    const model = createAdkProvider()()
    const { stream } = await model.doStream(callOptions())
    await expect(readStreamParts(stream)).rejects.toThrow(
      'ADK stream failed: Gemini Nano is not supported on this device'
    )
    expect(updateEmitter.handlerCount()).toBe(0)
  })
})
