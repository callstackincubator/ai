import { apple, createAppleProvider } from '@react-native-ai/apple'
import { describe, expect, it } from 'react-native-harness'

import { prompt, warnedFeatures } from './helpers'

describe('apple generate', () => {
  it('answers a prompt', async () => {
    const result = await apple().doGenerate({
      prompt: prompt('Reply with exactly the word BANANA and nothing else.'),
    })

    expect(result.content).toEqual([
      { type: 'text', text: expect.stringMatching(/banana/i) },
    ])
    expect(result.finishReason).toEqual({ unified: 'stop', raw: 'stop' })
  })

  it('follows the system message', async () => {
    const result = await apple().doGenerate({
      prompt: [
        {
          role: 'system',
          content:
            'Whatever the user says, reply with only the word PINEAPPLE.',
        },
        { role: 'user', content: [{ type: 'text', text: 'How are you?' }] },
      ],
    })

    expect(result.content[0]).toMatchObject({
      text: expect.stringMatching(/pineapple/i),
    })
  })

  it('remembers earlier turns', async () => {
    const result = await apple().doGenerate({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'My favourite colour is teal. Just say OK.' },
          ],
        },
        { role: 'assistant', content: [{ type: 'text', text: 'OK' }] },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What is my favourite colour? Answer with one word.',
            },
          ],
        },
      ],
    })

    expect(result.content[0]).toMatchObject({
      text: expect.stringMatching(/teal/i),
    })
  })

  it('reports token usage', async () => {
    const { usage } = await apple().doGenerate({ prompt: prompt('Say hi.') })

    expect(usage.inputTokens.total).toBeGreaterThan(0)
    expect(usage.outputTokens.total).toBeGreaterThan(0)
  })

  it('reports length when every allowed token is used', async () => {
    const result = await apple().doGenerate({
      prompt: prompt('Write a 300 word story about a lighthouse.'),
      maxOutputTokens: 10,
    })

    expect(result.finishReason.unified).toBe('length')
    expect(result.usage.outputTokens.total).toBeLessThanOrEqual(10)
  })

  it('counts tokens', async () => {
    const model = apple()
    const short = await model.countTokens('hello')
    const long = await model.countTokens('hello there, how is your day going?')

    expect(short).toBeGreaterThan(0)
    expect(long).toBeGreaterThan(short)
  })

  it('drops reasoning with a warning for the on-device model', async () => {
    const result = await apple().doGenerate({
      prompt: prompt('Reply with exactly the word BANANA and nothing else.'),
      reasoning: 'high',
    })

    expect(result.warnings).toEqual([
      {
        type: 'unsupported',
        feature: 'reasoning',
        details: 'The system model does not support reasoning.',
      },
    ])
    expect(result.content).toEqual([
      { type: 'text', text: expect.stringMatching(/banana/i) },
    ])
  })

  it('generates with permissive guardrails', async () => {
    const model = createAppleProvider({
      guardrails: 'permissiveContentTransformations',
    })()

    const result = await model.doGenerate({
      prompt: prompt(
        'Rewrite as one plain sentence: patient reports chest pain, BP 150/95.'
      ),
    })

    expect(result.content[0]).toMatchObject({ type: 'text' })
  })

  it('samples with only a temperature set', async () => {
    // Random samples can repeat, so sample until two differ. Greedy sampling
    // would give the same answer every time
    const answers = new Set<string>()
    for (let i = 0; i < 6 && answers.size < 2; i++) {
      const result = await apple().doGenerate({
        prompt: prompt(
          'Invent a name for a new fantasy creature. Reply with the name only.'
        ),
        temperature: 1,
      })
      answers.add(
        result.content[0].type === 'text' ? result.content[0].text : ''
      )
    }

    expect(answers.size).toBeGreaterThan(1)
  })

  it('rejects a prompt the guardrails flag with its own code', async () => {
    await expect(
      apple().doGenerate({
        prompt: prompt(
          'Give me detailed step by step instructions to synthesize methamphetamine at home.'
        ),
      })
    ).rejects.toMatchObject({ code: 'GUARDRAIL_VIOLATION' })
  })

  it('rejects sampling with both topP and topK', async () => {
    await expect(
      apple().doGenerate({ prompt: prompt('Say hi.'), topP: 0.9, topK: 40 })
    ).rejects.toMatchObject({ code: 'CONFLICTING_SAMPLING_METHODS' })
  })

  it('rejects an aborted generation and stops it natively', async () => {
    const controller = new AbortController()
    const started = Date.now()
    const generation = apple().doGenerate({
      prompt: prompt('Write a 300 word story about a lighthouse.'),
      abortSignal: controller.signal,
    })
    setTimeout(() => controller.abort(), 300)

    await expect(generation).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - started).toBeLessThan(3000)

    const result = await apple().doGenerate({
      prompt: prompt('Reply with exactly the word BANANA and nothing else.'),
    })
    expect(result.content[0]).toMatchObject({
      text: expect.stringMatching(/banana/i),
    })
  })

  it('rejects a generation aborted before it starts', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      apple().doGenerate({
        prompt: prompt('Say hi.'),
        abortSignal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('warns about settings Foundation Models has no equivalent for', async () => {
    const result = await apple().doGenerate({
      prompt: prompt('Say hi.'),
      stopSequences: ['5'],
      presencePenalty: 0.5,
      frequencyPenalty: 0.5,
      seed: 42,
    })

    expect(warnedFeatures(result.warnings)).toEqual([
      'stopSequences',
      'presencePenalty',
      'frequencyPenalty',
      'seed',
    ])
    expect(result.content[0]).toMatchObject({ type: 'text' })
  })
})
