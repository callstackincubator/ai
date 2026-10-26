import type { JSONSchema7 } from '@ai-sdk/provider'
import { apple, AppleFoundationModels } from '@react-native-ai/apple'
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

const orderedKeys = ['zulu', 'alpha', 'mike', 'bravo', 'yankee']

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

  it('orders properties of a property named properties', async () => {
    const output = await generateObject('Give each field a random word.', {
      type: 'object',
      properties: {
        properties: {
          type: 'object',
          properties: Object.fromEntries(
            orderedKeys.map((key) => [key, { type: 'string' }])
          ),
          required: orderedKeys,
        },
      },
      required: ['properties'],
    })

    expect(Object.keys(output.properties)).toEqual(orderedKeys)
  })

  it('orders properties of objects without a type', async () => {
    const output = await generateObject('Give each field a random word.', {
      properties: Object.fromEntries(
        orderedKeys.map((key) => [key, { type: 'string' }])
      ),
      required: orderedKeys,
    })

    expect(Object.keys(output)).toEqual(orderedKeys)
  })

  it('returns properties in the order the schema declares them', async () => {
    const output = await generateObject('Give each field a random word.', {
      type: 'object',
      properties: Object.fromEntries(
        orderedKeys.map((key) => [key, { type: 'string' }])
      ),
      required: orderedKeys,
    })

    expect(Object.keys(output)).toEqual(orderedKeys)
  })

  it('generates properties in the order the schema declares them', async () => {
    // Native receives objects as dictionaries, so the provider sends the order
    // in x-order. Snapshots show the order properties are generated in
    const snapshots: string[] = []
    await new Promise<void>((resolve, reject) => {
      const listeners = [
        AppleFoundationModels.onStreamUpdate(({ content }) => {
          snapshots.push(content)
        }),
        AppleFoundationModels.onStreamComplete(() => done()),
        AppleFoundationModels.onStreamError(({ error }) =>
          done(new Error(error))
        ),
      ]
      const done = (error?: Error) => {
        listeners.forEach((listener) => listener.remove())
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }
      AppleFoundationModels.generateStream(
        'property-order',
        [{ role: 'user', content: 'Give each field a random word.' }],
        {
          schema: {
            'type': 'object',
            'properties': Object.fromEntries(
              orderedKeys.map((key) => [key, { type: 'string' }])
            ),
            'required': orderedKeys,
            'x-order': orderedKeys,
          },
        }
      )
    })

    // Properties that first appear in the same snapshot can be in any order,
    // since the snapshot JSON does not keep key order
    const firstSnapshot = orderedKeys.map((key) =>
      snapshots.findIndex((snapshot) => key in JSON.parse(snapshot))
    )
    expect(firstSnapshot.every((index) => index >= 0)).toBe(true)
    expect(firstSnapshot).toEqual([...firstSnapshot].sort((a, b) => a - b))
    // Arbitrary order would almost never keep every snapshot index in order
    expect(new Set(firstSnapshot).size).toBeGreaterThan(1)
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

  it('generates nested objects and arrays', async () => {
    const output = await generateObject(
      'Name the star our solar system orbits, and list Earth and Mars with their number of moons.',
      {
        type: 'object',
        properties: {
          star: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
          planets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                moons: { type: 'integer' },
              },
              required: ['name', 'moons'],
            },
          },
        },
        required: ['star', 'planets'],
      }
    )

    expect(output.star.name).toMatch(/sun/i)
    expect(output.planets.length).toBeGreaterThan(0)
    expect(Number.isInteger(output.planets[0].moons)).toBe(true)
  })

  it('picks only listed integer enum values', async () => {
    const { value } = await generateObject(
      'Pick the number 7.',
      numberSchema({ type: 'integer', enum: [1, 2, 3] })
    )

    expect([1, 2, 3]).toContain(value)
  })

  it('picks only listed number enum values', async () => {
    const { value } = await generateObject(
      'Pick the number 9.',
      numberSchema({ type: 'number', enum: [0.5, 1.5] })
    )

    expect([0.5, 1.5]).toContain(value)
  })

  it('picks fractional enum values in nested arrays', async () => {
    const output = await generateObject('Rate three songs with a score each.', {
      type: 'object',
      properties: {
        ratings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              song: { type: 'string' },
              score: { type: 'number', enum: [1, 2.5, 4] },
            },
            required: ['song', 'score'],
          },
        },
      },
      required: ['ratings'],
    })

    expect(output.ratings.length).toBeGreaterThan(0)
    for (const rating of output.ratings) {
      expect([1, 2.5, 4]).toContain(rating.score)
    }
  })

  it('streams fractional enum values as numbers', async () => {
    const { stream } = await apple().doStream({
      prompt: prompt('Pick the number 9.'),
      responseFormat: {
        type: 'json',
        schema: numberSchema({ type: 'number', enum: [0.5, 1.5] }),
      },
    })

    const { value } = JSON.parse(textOf(await readAll(stream)))
    expect([0.5, 1.5]).toContain(value)
  })

  it('accepts nullable fields', async () => {
    const output = await generateObject('Describe a cat named Tom.', {
      type: 'object',
      properties: {
        name: { type: 'string' },
        nickname: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
      required: ['name', 'nickname'],
    })

    expect(output.name).toMatch(/tom/i)
    expect(
      output.nickname === null || typeof output.nickname === 'string'
    ).toBe(true)
  })

  it('keeps string literals', async () => {
    const output = await generateObject('Name a fruit.', {
      type: 'object',
      properties: {
        kind: { type: 'string', const: 'fruit' },
        name: { type: 'string' },
      },
      required: ['kind', 'name'],
    })

    expect(output.kind).toBe('fruit')
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
