import { generateText, streamText } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { setupLanguageModel } from './helpers'

const model = setupLanguageModel()

describe('llama stream', () => {
  it('streams text', async () => {
    const result = streamText({
      model: model(),
      prompt: 'Count from 1 to 5, separated by spaces.',
      reasoning: 'none',
    })

    const deltas: string[] = []
    for await (const delta of result.textStream) {
      deltas.push(delta)
    }

    expect(deltas.length).toBeGreaterThan(1)
    expect(deltas.join('')).toMatch(/1.*2.*3.*4.*5/s)
  })

  it('survives tokens that arrive after a stream is cancelled', async () => {
    const controller = new AbortController()
    const result = streamText({
      model: model(),
      prompt: 'Write a 300 word story about a lighthouse.',
      reasoning: 'none',
      abortSignal: controller.signal,
    })

    const reader = result.textStream.getReader()
    await reader.read()
    controller.abort()
    await reader.cancel()

    const next = await generateText({
      model: model(),
      prompt: 'Reply with exactly the word BANANA and nothing else.',
      reasoning: 'none',
    })
    expect(next.text).toMatch(/banana/i)
  })
})
