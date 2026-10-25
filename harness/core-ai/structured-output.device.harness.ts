import { generateText, Output } from 'ai'
import { describe, expect, it } from 'react-native-harness'
import { z } from 'zod'

import { setupLanguageModel } from './helpers'

const model = setupLanguageModel()

describe('core-ai structured output', () => {
  it('generates an object', async () => {
    const { output } = await generateText({
      model: model(),
      prompt: 'In which city is the Eiffel Tower?',
      reasoning: 'none',
      output: Output.object({ schema: z.object({ city: z.string() }) }),
    })

    expect(output.city).toMatch(/paris/i)
  })

  it('picks only listed enum values', async () => {
    const { output } = await generateText({
      model: model(),
      prompt: 'The weather is awful today.',
      reasoning: 'none',
      output: Output.object({
        schema: z.object({ sentiment: z.enum(['positive', 'negative']) }),
      }),
    })

    expect(output.sentiment).toBe('negative')
  })
})
