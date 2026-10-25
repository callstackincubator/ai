import { describe, expect, it } from 'react-native-harness'

import { setupLanguageModel } from './helpers'

const model = setupLanguageModel()

const textOf = (parts: { type: string; text?: string }[]) =>
  parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('')

describe('core-ai sessions', () => {
  it('keeps the conversation across turns', async () => {
    const session = await model().createSession({
      instructions: 'Answer in one short sentence.',
    })
    try {
      await session.respond('My favourite colour is teal.')
      const answer = await session.respond('What is my favourite colour?')

      expect(textOf(answer)).toMatch(/teal/i)
    } finally {
      await session.close()
    }
  })

  it('streams a response', async () => {
    const session = await model().createSession({})
    try {
      const reader = (await session.stream('Name three fruits.')).getReader()
      let chunks = 0
      while (!(await reader.read()).done) {
        chunks++
      }

      expect(chunks).toBeGreaterThan(1)
    } finally {
      await session.close()
    }
  })

  it('describes the model', async () => {
    const info = await model().inspect()

    expect(info.id).toBe('qwen3-0.6b')
    expect(info.platforms).toContain('iOS')
  })
})
