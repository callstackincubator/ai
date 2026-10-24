import type { LanguageModelV4CallOptions } from '@ai-sdk/provider'
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
      onToolCall: () => ({ remove: () => {} }),
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
