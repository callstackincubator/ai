import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider'
import { beforeEach, describe, expect, mock, test } from 'bun:test'

const generateText = mock(
  async (
    _runId: string,
    _messages: unknown[],
    _config: unknown,
    _options: unknown,
    _tools: unknown
  ) => ({ content: 'ok', finishReason: 'STOP' })
)

mock.module('react-native', () => ({
  Platform: { OS: 'android' },
  TurboModuleRegistry: {
    getEnforcing: () => ({
      generateText,
      streamText: async () => {},
      onToolCall: () => ({ remove: () => {} }),
      onStreamUpdate: () => ({ remove: () => {} }),
      onStreamToolCall: () => ({ remove: () => {} }),
      onStreamComplete: () => ({ remove: () => {} }),
      onStreamError: () => ({ remove: () => {} }),
    }),
  },
}))

const { createAdkProvider } = await import('../ai-sdk')

const model = createAdkProvider({ modelType: 'gemini' })()

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

beforeEach(() => {
  generateText.mockClear()
})

describe('adk prompt conversion', () => {
  test('resolves top-level file media types to a full mime type', async () => {
    await model.doGenerate(
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

    expect(generateText.mock.calls.at(-1)![1]).toEqual([
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
})

const reasoningWarning = {
  type: 'unsupported',
  feature: 'reasoning',
  details: 'ADK models do not support configuring reasoning.',
}

async function readFirstPart(
  stream: ReadableStream<LanguageModelV4StreamPart>
) {
  const { value } = await stream.getReader().read()
  return value
}

describe('adk language model warnings', () => {
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

    expect(await readFirstPart(stream)).toEqual({
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
  test('does not warn for reasoning none', async () => {
    const result = await model.doGenerate(
      createCallOptions({ reasoning: 'none' })
    )

    expect(result.warnings).toEqual([])
  })

  test('warns that required tool choice is unsupported', async () => {
    const result = await model.doGenerate(
      createCallOptions({ toolChoice: { type: 'required' } })
    )

    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'toolChoice',
        details: 'ADK models only support auto and none tool choices.',
      },
    ])
  })
})
