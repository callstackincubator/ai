import type { JSONSchema7 } from '@ai-sdk/provider'
import { apple } from '@react-native-ai/apple'
import { describe, expect, it } from 'react-native-harness'

import { prompt, readAll, textOf } from './helpers'

async function generateObject(text: string, schema: JSONSchema7) {
  const result = await apple().doGenerate({
    prompt: prompt(text),
    responseFormat: { type: 'json', schema },
  })
  const [part] = result.content
  if (part?.type !== 'text') {
    throw new Error(`Expected a text part, got ${JSON.stringify(part)}`)
  }
  return JSON.parse(part.text)
}

function numberSchema(value: JSONSchema7): JSONSchema7 {
  return {
    type: 'object',
    properties: { value },
    required: ['value'],
  }
}

describe('apple structured output', () => {
  it('generates an object', async () => {
    const output = await generateObject('In which city is the Eiffel Tower?', {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    })

    expect(output.city).toMatch(/paris/i)
  })

  it('picks only listed string enum values', async () => {
    const output = await generateObject('The weather is awful today.', {
      type: 'object',
      properties: {
        sentiment: { type: 'string', enum: ['positive', 'negative'] },
      },
      required: ['sentiment'],
    })

    expect(output.sentiment).toBe('negative')
  })

  it('keeps integers within their minimum and maximum', async () => {
    const { value } = await generateObject(
      'Pick the number 50.',
      numberSchema({ type: 'integer', minimum: 1, maximum: 10 })
    )

    expect(Number.isInteger(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(1)
    expect(value).toBeLessThanOrEqual(10)
  })

  it('keeps integers within exclusive bounds', async () => {
    const { value } = await generateObject(
      'Pick the number 50.',
      numberSchema({
        type: 'integer',
        exclusiveMinimum: 0,
        exclusiveMaximum: 10,
      })
    )

    expect(value).toBeGreaterThanOrEqual(1)
    expect(value).toBeLessThanOrEqual(9)
  })

  it('rounds fractional integer bounds inward', async () => {
    const { value } = await generateObject(
      'Pick the number 50.',
      numberSchema({
        type: 'integer',
        exclusiveMinimum: 0.5,
        exclusiveMaximum: 5.5,
      })
    )

    expect(value).toBeGreaterThanOrEqual(1)
    expect(value).toBeLessThanOrEqual(5)
  })

  it('keeps the stricter of two bounds', async () => {
    const { value } = await generateObject(
      'Pick the number 50.',
      numberSchema({
        type: 'integer',
        minimum: 0,
        exclusiveMinimum: 2,
        maximum: 10,
        exclusiveMaximum: 8,
      })
    )

    expect(value).toBeGreaterThanOrEqual(3)
    expect(value).toBeLessThanOrEqual(7)
  })

  it('keeps numbers within their bounds', async () => {
    const { value } = await generateObject(
      'Pick the number 50.',
      numberSchema({ type: 'number', minimum: 1.5, maximum: 10.5 })
    )

    expect(value).toBeGreaterThanOrEqual(1.5)
    expect(value).toBeLessThanOrEqual(10.5)
  })

  it('sends the final json once a stream completes', async () => {
    const { stream } = await apple().doStream({
      prompt: prompt('In which city is the Eiffel Tower?'),
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    })
    const parts = await readAll(stream)

    expect(parts.filter((part) => part.type === 'text-delta')).toHaveLength(1)
    expect(JSON.parse(textOf(parts)).city).toMatch(/paris/i)
  })
})
