import { describe, expect, test } from 'bun:test'

import { getAppleLLMStub } from './mocks'

const { default: AppleFoundationModels } =
  await import('../AppleFoundationModels')

describe('AppleFoundationModels facade', () => {
  test('delegates availability and generation to the native module', async () => {
    const calls: string[] = []
    Object.assign(getAppleLLMStub(), {
      isAvailable: () => {
        calls.push('isAvailable')
        return true
      },
      countTokens: async (text: string) => {
        calls.push(`countTokens:${text}`)
        return text.split(' ').length
      },
      generateText: async () => {
        calls.push('generateText')
        return [{ type: 'text', text: 'ok' }]
      },
      generateStream: (_id: string) => {
        calls.push('generateStream')
      },
      cancelStream: (id: string) => {
        calls.push(`cancelStream:${id}`)
      },
      onStreamUpdate: () => ({ remove: () => {} }),
      onStreamComplete: () => ({ remove: () => {} }),
      onStreamError: () => ({ remove: () => {} }),
    })

    expect(AppleFoundationModels.isAvailable()).toBe(true)
    expect(await AppleFoundationModels.countTokens('one two three')).toBe(3)
    expect(
      await AppleFoundationModels.generateText(
        [{ role: 'user', content: 'hi' }],
        {}
      )
    ).toEqual([{ type: 'text', text: 'ok' }])
    AppleFoundationModels.generateStream('s1', [], {})
    AppleFoundationModels.cancelStream('s1')

    expect(calls).toEqual([
      'isAvailable',
      'countTokens:one two three',
      'generateText',
      'generateStream',
      'cancelStream:s1',
    ])
  })

  test('rejects token counting when the native method is missing', async () => {
    Object.assign(getAppleLLMStub(), { countTokens: undefined })

    await expect(AppleFoundationModels.countTokens('hello')).rejects.toThrow(
      'Apple Foundation Models token counting is unavailable.'
    )
  })
})
