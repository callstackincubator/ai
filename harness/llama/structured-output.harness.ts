import { generateText, jsonSchema, Output } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { setupLanguageModel } from './helpers'

const model = setupLanguageModel()

describe('llama structured output', () => {
  it('generates an object', async () => {
    const result = await generateText({
      model: model(),
      prompt: 'In which city is the Eiffel Tower?',
      output: Output.object({
        schema: jsonSchema<{ city: string }>({
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        }),
      }),
    })

    expect(result.output.city).toMatch(/paris/i)
  })

  it('turns reasoning off for structured output and warns about it', async () => {
    const result = await generateText({
      model: model(),
      prompt: 'In which city is the Eiffel Tower?',
      reasoning: 'high',
      output: Output.object({
        schema: jsonSchema<{ city: string }>({
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        }),
      }),
    })

    expect(result.reasoningText).toBeUndefined()
    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'reasoning',
        details: 'Reasoning is turned off for structured output.',
      },
    ])
  })
})
