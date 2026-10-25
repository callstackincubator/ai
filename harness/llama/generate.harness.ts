import { generateText } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { setupLanguageModel } from './helpers'

const model = setupLanguageModel()

describe('llama generate', () => {
  it('loads the model once for concurrent prepare calls', async () => {
    const [first, second] = await Promise.all([
      model().prepare(),
      model().prepare(),
    ])

    expect(first).toBe(second)
  })

  it('generates text', async () => {
    const result = await generateText({
      model: model(),
      prompt: 'Reply with exactly the word BANANA and nothing else.',
      reasoning: 'none',
    })

    expect(result.text).toMatch(/banana/i)
    expect(result.finishReason).toBe('stop')
    expect(result.usage.inputTokens).toBeGreaterThan(0)
    expect(result.usage.outputTokens).toBeGreaterThan(0)
  })

  it('returns reasoning before the answer', async () => {
    const result = await generateText({
      model: model(),
      prompt: 'What is 17 times 23? Answer with the number only.',
      reasoning: 'low',
    })

    const types = result.content.map((part) => part.type)
    expect(types[0]).toBe('reasoning')
    expect(types.at(-1)).toBe('text')
    expect(result.text).toContain('391')
  })

  it('does not reason for reasoning none', async () => {
    const result = await generateText({
      model: model(),
      prompt: 'What is 2 plus 2? Answer with the number only.',
      reasoning: 'none',
    })

    expect(result.reasoningText).toBeUndefined()
    expect(result.text).toContain('4')
  })

  it('reports length when the output token limit is reached', async () => {
    const result = await generateText({
      model: model(),
      prompt: 'Write a 300 word story about a lighthouse.',
      reasoning: 'none',
      maxOutputTokens: 10,
    })

    expect(result.finishReason).toBe('length')
    expect(result.usage.outputTokens).toBeLessThanOrEqual(10)
  })

  it('counts tokens', async () => {
    expect(await model().countTokens('hello world')).toBeGreaterThan(0)
  })

  it('rejects an aborted generation and keeps working', async () => {
    const controller = new AbortController()
    const promise = generateText({
      model: model(),
      prompt: 'Write a 300 word story about a lighthouse.',
      reasoning: 'none',
      abortSignal: controller.signal,
    })
    setTimeout(() => controller.abort(), 500)

    await expect(promise).rejects.toThrow()

    const result = await generateText({
      model: model(),
      prompt: 'Reply with exactly the word BANANA and nothing else.',
      reasoning: 'none',
    })
    expect(result.text).toMatch(/banana/i)
  })
})
