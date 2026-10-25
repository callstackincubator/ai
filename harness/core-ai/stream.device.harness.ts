import { streamText } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { setupLanguageModel } from './helpers'

const model = setupLanguageModel()

describe('core-ai stream', () => {
  it('streams text in deltas', async () => {
    const result = streamText({
      model: model(),
      prompt: 'Name three fruits, separated by commas.',
      reasoning: 'none',
    })

    const deltas: string[] = []
    for await (const delta of result.textStream) {
      deltas.push(delta)
    }

    expect(deltas.length).toBeGreaterThan(1)
    // Deltas, not cumulative snapshots
    expect(deltas.join('')).toBe(await result.text)
    expect(await result.finishReason).toBe('stop')
  })

  it('streams reasoning before the answer', async () => {
    const result = streamText({
      model: model(),
      prompt: 'What is 6 times 7? Answer with the number only.',
      maxOutputTokens: 2048,
    })

    const types: string[] = []
    for await (const part of result.fullStream) {
      if (part.type === 'reasoning-delta' || part.type === 'text-delta') {
        if (types.at(-1) !== part.type) types.push(part.type)
      }
    }

    expect(types).toEqual(['reasoning-delta', 'text-delta'])
    expect(await result.text).toContain('42')
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    const result = streamText({
      model: model(),
      prompt: 'Write a long story about a dragon.',
      reasoning: 'none',
      abortSignal: controller.signal,
    })

    let deltas = 0
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta' && ++deltas === 3) {
        controller.abort()
      }
    }

    expect(deltas).toBeLessThan(20)
  })
})
