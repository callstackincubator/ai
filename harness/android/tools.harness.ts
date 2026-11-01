import { generateText, isStepCount, jsonSchema, streamText, tool } from 'ai'
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'react-native-harness'
import { z } from 'zod'

import { cooldown, nano4 } from './helpers'

function createTools() {
  const calls: { name: string; input: unknown }[] = []
  const tools = {
    getWeather: tool({
      description: 'Gets the current weather in a city.',
      inputSchema: z.object({
        city: z.string().describe('The city name, such as London'),
      }),
      execute: async (input) => {
        calls.push({ name: 'getWeather', input })
        return { city: input.city, condition: 'sunny', temperatureC: 24 }
      },
    }),
    getCurrentTime: tool({
      description: 'Gets the current local time.',
      inputSchema: jsonSchema<Record<string, never>>({
        type: 'object',
        properties: {},
      }),
      execute: async (input) => {
        calls.push({ name: 'getCurrentTime', input })
        return { time: '10:42' }
      },
    }),
  }
  return { calls, tools }
}

// Function calling needs Gemini Nano 4 through the AICore developer preview
describe('android tools', () => {
  beforeAll(async () => {
    await nano4().prepare()
  })
  beforeEach(cooldown)

  it('calls a tool with the arguments the model chose', async () => {
    const { calls, tools } = createTools()

    const result = await generateText({
      model: nano4(),
      tools,
      prompt: 'What is the weather in Paris? Use your tool.',
    })

    expect(calls).toEqual([
      { name: 'getWeather', input: { city: expect.stringMatching(/paris/i) } },
    ])
    expect(result.finishReason).toBe('tool-calls')
  })

  it('calls a tool without arguments', async () => {
    const { calls, tools } = createTools()

    await generateText({
      model: nano4(),
      tools,
      prompt: 'What time is it right now? Use your tool.',
    })

    expect(calls).toEqual([{ name: 'getCurrentTime', input: {} }])
  })

  it('answers with the tool result over several steps', async () => {
    const { calls, tools } = createTools()

    const result = await generateText({
      model: nano4(),
      tools,
      stopWhen: isStepCount(3),
      prompt:
        'What is the weather in Paris? Use your tool, then tell me the temperature.',
    })

    expect(calls.map((call) => call.name)).toContain('getWeather')
    expect(result.steps.length).toBeGreaterThan(1)
    expect(result.text).toMatch(/24/)
  })

  it('streams a tool call', async () => {
    const { calls, tools } = createTools()

    const result = streamText({
      model: nano4(),
      tools,
      prompt: 'What is the weather in Tokyo? Use your tool.',
    })

    const types: string[] = []
    for await (const part of result.fullStream) {
      types.push(part.type)
    }
    expect(types).toContain('tool-call')
    expect(types).toContain('tool-result')
    expect(calls[0]?.name).toBe('getWeather')
  })

  it('calls no tools for none tool choice', async () => {
    const { calls, tools } = createTools()

    await generateText({
      model: nano4(),
      tools,
      toolChoice: 'none',
      prompt: 'What is the weather in Paris?',
    })

    expect(calls).toEqual([])
  })
})
