import { generateText } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { setupLanguageModel } from './helpers'

const model = setupLanguageModel()

describe('core-ai generate', () => {
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
      prompt: 'What is 17 times 3? Answer with the number only.',
      // Qwen3 can think past its fixed iOS context length, which crashes
      // Apple's engine, so the answer is capped
      maxOutputTokens: 2048,
    })

    const types = result.content.map((part) => part.type)
    expect(types[0]).toBe('reasoning')
    expect(types.at(-1)).toBe('text')
    expect(result.text).toContain('51')
    expect(result.usage.outputTokenDetails.reasoningTokens).toBeGreaterThan(0)
  })

  it('does not reason for reasoning none', async () => {
    const result = await generateText({
      model: model(),
      prompt: 'What is the capital of France? Answer with one word.',
      reasoning: 'none',
    })

    expect(result.content.map((part) => part.type)).toEqual(['text'])
    expect(result.text).toMatch(/paris/i)
  })

  it('follows instructions', async () => {
    const result = await generateText({
      model: model(),
      instructions: 'Always answer in French.',
      prompt: 'What colour is the sky?',
      reasoning: 'none',
    })

    expect(result.text).toMatch(/ciel|bleu/i)
  })

  it('sends the earlier turns of the conversation', async () => {
    const result = await generateText({
      model: model(),
      reasoning: 'none',
      messages: [
        { role: 'user', content: 'My name is Zebulon.' },
        { role: 'assistant', content: 'Nice to meet you, Zebulon!' },
        { role: 'user', content: 'What is my name?' },
      ],
    })

    expect(result.text).toMatch(/zebulon/i)
  })

  it('stops at maxOutputTokens', async () => {
    const result = await generateText({
      model: model(),
      prompt: 'Count from 1 to 100, separated by commas.',
      reasoning: 'none',
      maxOutputTokens: 10,
    })

    expect(result.finishReason).toBe('length')
    expect(result.usage.outputTokens).toBeLessThanOrEqual(10)
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    const request = generateText({
      model: model(),
      prompt: 'Write a long story about a dragon.',
      reasoning: 'none',
      abortSignal: controller.signal,
    })
    setTimeout(() => controller.abort(), 200)

    await expect(request).rejects.toThrow()
  })
})
