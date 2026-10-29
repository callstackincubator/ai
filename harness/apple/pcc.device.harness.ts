import type {
  LanguageModelV4ReasoningPart,
  LanguageModelV4TextPart,
} from '@ai-sdk/provider'
import { apple } from '@react-native-ai/apple'
import { describe, expect, it } from 'react-native-harness'

import { prompt, readAll } from './helpers'

// Private Cloud Compute needs its entitlement, so these pass only when the app
// was built with PCC=1 (see apps/example/app.config.js)

describe('apple private cloud compute', () => {
  it('is available', async () => {
    const info = await apple.getModelInfo({ model: 'private-cloud-compute' })

    expect(info.availability).toBe('available')
  })

  it('reports its quota', async () => {
    const { quota } = await apple.getModelInfo({
      model: 'private-cloud-compute',
    })

    expect(quota).toMatchObject({
      isLimitReached: expect.any(Boolean),
      isApproachingLimit: expect.any(Boolean),
      canIncreaseLimit: expect.any(Boolean),
    })
  })

  it('answers a prompt', async () => {
    const result = await apple('private-cloud-compute').doGenerate({
      prompt: prompt('Reply with exactly the word BANANA and nothing else.'),
    })

    expect(result.content.at(-1)).toMatchObject({
      text: expect.stringMatching(/banana/i),
    })
  })

  it('returns apple reasoning before the answer', async () => {
    const result = await apple('private-cloud-compute').doGenerate({
      prompt: prompt('What is 17 times 23? Answer with the number only.'),
      reasoning: 'high',
    })

    const types = result.content.map((part) => part.type)
    expect(types[0]).toBe('reasoning')
    expect(types.at(-1)).toBe('text')
    expect(result.content[0]).toMatchObject({
      providerMetadata: { apple: expect.any(Object) },
    })
    expect(result.content.at(-1)).toMatchObject({
      text: expect.stringContaining('391'),
    })
  })

  it('streams reasoning before the text', async () => {
    const { stream } = await apple('private-cloud-compute').doStream({
      prompt: prompt('What is 17 times 23? Answer with the number only.'),
      reasoning: 'high',
    })
    const types = (await readAll(stream)).map((part) => part.type)

    expect(types.indexOf('reasoning-start')).toBeGreaterThan(-1)
    expect(types.indexOf('reasoning-end')).toBeLessThan(
      types.indexOf('text-start')
    )
  })

  it('replays its reasoning in later turns', async () => {
    const model = apple('private-cloud-compute')
    const first = await model.doGenerate({
      prompt: prompt('Pick a random fruit and tell me only its name.'),
      reasoning: 'low',
    })

    const result = await model.doGenerate({
      prompt: [
        ...prompt('Pick a random fruit and tell me only its name.'),
        {
          role: 'assistant',
          // Apple reasoning is replayed with the signature it was returned with
          content: first.content.flatMap(
            (
              part
            ): (LanguageModelV4ReasoningPart | LanguageModelV4TextPart)[] => {
              if (part.type === 'reasoning') {
                return [
                  {
                    type: 'reasoning',
                    text: part.text,
                    providerOptions: part.providerMetadata,
                  },
                ]
              }
              return part.type === 'text'
                ? [{ type: 'text', text: part.text }]
                : []
            }
          ),
        },
        ...prompt('Which fruit did you pick? One word.'),
      ],
      reasoning: 'low',
    })

    expect(result.content.at(-1)).toMatchObject({ type: 'text' })
  })
})
