import { generateText, stepCountIs, streamText, tool } from 'ai'
import { describe, expect, it } from 'react-native-harness'
import { z } from 'zod'

import { setupLanguageModel } from './helpers'

const model = setupLanguageModel()

function createWeatherTool() {
  const cities: string[] = []
  const getWeather = tool({
    description: 'Gets the current weather in a city',
    inputSchema: z.object({ city: z.string() }),
    execute: async ({ city }) => {
      cities.push(city)
      return { city, temperature: 21, conditions: 'sunny' }
    },
  })
  return { cities, getWeather }
}

describe('core-ai tool calling', () => {
  it('runs a tool and answers with its result', async () => {
    const { cities, getWeather } = createWeatherTool()

    const { steps, text } = await generateText({
      model: model(),
      prompt: 'What is the weather in Paris right now? Use the tool.',
      reasoning: 'none',
      tools: { getWeather },
      stopWhen: stepCountIs(3),
    })

    expect(steps[0]!.finishReason).toBe('tool-calls')
    expect(steps[0]!.toolCalls[0]!.toolName).toBe('getWeather')
    expect(cities[0]).toMatch(/paris/i)
    expect(steps.at(-1)!.finishReason).toBe('stop')
    expect(text).toMatch(/21|sunny/i)
  })

  it('streams a tool round trip', async () => {
    const { cities, getWeather } = createWeatherTool()

    const result = streamText({
      model: model(),
      prompt: 'What is the weather in Tokyo right now? Use the tool.',
      reasoning: 'none',
      tools: { getWeather },
      stopWhen: stepCountIs(3),
    })
    const text = await result.text
    const steps = await result.steps

    expect(steps[0]!.toolCalls[0]!.toolName).toBe('getWeather')
    expect(cities[0]).toMatch(/tokyo/i)
    expect(text).toMatch(/21|sunny/i)
  })
})
