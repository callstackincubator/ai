import { adk, createAdkProvider } from '@react-native-ai/adk'
import { generateText, jsonSchema, streamText, tool } from 'ai'
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'react-native-harness'

import { cooldown, prompt } from './helpers'

describe('adk gemini nano', () => {
  beforeAll(async () => {
    await adk().prepare()
  })
  beforeEach(cooldown)

  it('answers a prompt', async () => {
    const result = await adk().doGenerate({
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
      model: adk(),
      system: 'Whatever the user says, reply with only the word PINEAPPLE.',
      prompt: 'How are you?',
    })

    expect(text).toMatch(/pineapple/i)
  })

  it('follows the provider instruction', async () => {
    const model = createAdkProvider({
      instruction: 'Whatever the user says, reply with only the word MANGO.',
    })()

    const { text } = await generateText({ model, prompt: 'How are you?' })

    expect(text).toMatch(/mango/i)
  })

  it('remembers earlier turns', async () => {
    const { text } = await generateText({
      model: adk(),
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

  it('streams text', async () => {
    const result = streamText({
      model: adk(),
      prompt: 'Count from 1 to 5, separated by spaces.',
    })

    let deltas = 0
    for await (const delta of result.textStream) {
      if (delta) deltas++
    }
    expect(await result.text).toMatch(/1.*2.*3.*4.*5/s)
    expect(deltas).toBeGreaterThan(0)
  })

  it('warns that tools are unsupported', async () => {
    const { warnings } = await generateText({
      model: adk(),
      prompt: 'What is the weather in Paris?',
      tools: {
        getWeather: tool({
          inputSchema: jsonSchema<{ city: string }>({ type: 'object' }),
          execute: async () => 'Sunny',
        }),
      },
    })

    expect(warnings).toContainEqual(
      expect.objectContaining({ type: 'unsupported', feature: 'tools' })
    )
  })

  it('warns that JSON output is unsupported', async () => {
    const { warnings } = await adk().doGenerate({
      prompt: prompt('Describe a cat.'),
      responseFormat: { type: 'json' },
    })

    expect(warnings).toContainEqual(
      expect.objectContaining({
        type: 'unsupported',
        feature: 'responseFormat',
      })
    )
  })
})
