import { android } from '@react-native-ai/android'
import { generateText, streamText } from 'ai'
import { File, Paths } from 'expo-file-system'
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'react-native-harness'

import { base64ToBytes, redSquare } from '../fixtures'
import { cooldown, prompt, readAll } from './helpers'

describe('android gemini nano', () => {
  beforeAll(async () => {
    await android().prepare()
  })
  beforeEach(cooldown)

  it('answers a prompt', async () => {
    const result = await android().doGenerate({
      prompt: prompt('Reply with exactly the word BANANA and nothing else.'),
    })

    expect(result.content.at(-1)).toMatchObject({
      type: 'text',
      text: expect.stringMatching(/banana/i),
    })
    expect(result.finishReason.unified).toBe('stop')
  })

  it('follows the system message', async () => {
    const { text } = await generateText({
      model: android(),
      system: 'Whatever the user says, reply with only the word PINEAPPLE.',
      prompt: 'How are you?',
    })

    expect(text).toMatch(/pineapple/i)
  })

  it('remembers earlier turns', async () => {
    const { text } = await generateText({
      model: android(),
      messages: [
        { role: 'user', content: 'My favourite colour is teal. Just say OK.' },
        { role: 'assistant', content: 'OK' },
        {
          role: 'user',
          content: 'What is my favourite colour? Answer with one word.',
        },
      ],
    })

    expect(text).toMatch(/teal/i)
  })

  it('streams text in several deltas', async () => {
    const result = streamText({
      model: android(),
      prompt: 'Count from 1 to 10, separated by spaces.',
    })

    let deltas = 0
    for await (const delta of result.textStream) {
      if (delta) deltas++
    }
    expect(await result.text).toMatch(/1.*2.*3.*4.*5/s)
    expect(deltas).toBeGreaterThan(1)
  })

  it('describes an image', async () => {
    const { text } = await generateText({
      model: android(),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: base64ToBytes(redSquare),
            },
            {
              type: 'text',
              text: 'What colour is this image? Answer with one word.',
            },
          ],
        },
      ],
    })

    expect(text).toMatch(/red/i)
  })

  it('reads a local file image', async () => {
    const file = new File(Paths.cache, 'harness-red.png')
    file.write(base64ToBytes(redSquare))

    const { text } = await generateText({
      model: android(),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: new URL(file.uri) },
            {
              type: 'text',
              text: 'What colour is this image? Answer with one word.',
            },
          ],
        },
      ],
    })

    expect(text).toMatch(/red/i)
  })

  it('reads a data URL image', async () => {
    const { text } = await generateText({
      model: android(),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: `data:image/png;base64,${redSquare}` },
            {
              type: 'text',
              text: 'What colour is this image? Answer with one word.',
            },
          ],
        },
      ],
    })

    expect(text).toMatch(/red/i)
  })

  it('remembers earlier turns after a system message', async () => {
    const { text } = await generateText({
      model: android(),
      system: 'You are a helpful assistant. Answer briefly.',
      messages: [
        { role: 'user', content: 'My dog is called Biscuit. Just say OK.' },
        { role: 'assistant', content: 'OK' },
        {
          role: 'user',
          content: 'What is my dog called? Answer with one word.',
        },
      ],
    })

    expect(text).toMatch(/biscuit/i)
    // A merged prompt has no role labels, which Nano should not echo
    expect(text).not.toMatch(/^(user|model|assistant):/im)
  })

  it('stops at the output token limit', async () => {
    const result = await android().doGenerate({
      prompt: prompt('Write a long story about a dragon.'),
      maxOutputTokens: 8,
    })

    expect(result.finishReason.unified).toBe('length')
  })

  // Gemini Nano before v4, such as nano-v2 on a Pixel 9 Pro, has neither
  it('streams reasoning in thinking mode, or warns without it', async () => {
    const info = await android.getModelInfo()

    const { stream } = await android().doStream({
      prompt: prompt('Is 17 a prime number? Answer yes or no.'),
      reasoning: 'high',
    })
    const parts = await readAll(stream)
    const types = parts.map((part) => part.type)

    expect(types).toContain('text-delta')
    if (info.features?.includes('thinking')) {
      expect(types).toContain('reasoning-delta')
    } else {
      expect(parts[0]).toMatchObject({
        type: 'stream-start',
        warnings: [expect.objectContaining({ feature: 'reasoning' })],
      })
    }
  })

  it('warns that tools are unsupported without function calling', async () => {
    const info = await android.getModelInfo()
    if (info.features?.includes('functionCalling')) {
      return
    }

    const { warnings } = await android().doGenerate({
      prompt: prompt('What is the weather in Paris?'),
      tools: [
        {
          type: 'function',
          name: 'getWeather',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    })

    expect(warnings).toContainEqual(
      expect.objectContaining({ type: 'unsupported', feature: 'tools' })
    )
  })

  it('warns that structured output is unsupported', async () => {
    const { warnings } = await android().doGenerate({
      prompt: prompt('Describe a cat in one sentence.'),
      responseFormat: {
        type: 'json',
        schema: { type: 'object', properties: { name: { type: 'string' } } },
      },
      topP: 0.5,
    })

    expect(warnings).toContainEqual(
      expect.objectContaining({
        type: 'unsupported',
        feature: 'responseFormat',
      })
    )
    expect(warnings).toContainEqual(
      expect.objectContaining({ type: 'unsupported', feature: 'topP' })
    )
  })

  it('cancels a stream', async () => {
    const controller = new AbortController()
    const result = streamText({
      model: android(),
      prompt: 'Write a long story about a dragon.',
      abortSignal: controller.signal,
    })

    // The AI SDK ends the stream when it is aborted. Deltas already queued
    // before the abort lands can still arrive
    let deltas = 0
    for await (const delta of result.textStream) {
      if (delta && ++deltas === 2) controller.abort()
    }
    expect(deltas).toBeGreaterThanOrEqual(2)
    expect(deltas).toBeLessThan(10)
  })
})
