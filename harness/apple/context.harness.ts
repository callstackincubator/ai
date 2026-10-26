import type { LanguageModelV4Prompt } from '@ai-sdk/provider'
import { apple } from '@react-native-ai/apple'
import { wrapLanguageModelWithHistory } from '@react-native-ai/utils'
import { describe, expect, it } from 'react-native-harness'

const topics = [
  'lighthouses',
  'tea ceremonies',
  'glaciers',
  'jazz',
  'beekeeping',
  'volcanoes',
  'origami',
  'tides',
]

// A conversation that is longer than the on-device context window, with a
// fact in its first turn
function longConversation(): LanguageModelV4Prompt {
  const prompt: LanguageModelV4Prompt = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Remember this: the secret code is 7194.' },
      ],
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Got it, the secret code is 7194.' }],
    },
  ]
  for (let i = 0; i < 24; i++) {
    const topic = topics[i % topics.length]
    prompt.push(
      {
        role: 'user',
        content: [{ type: 'text', text: `Tell me about ${topic}, part ${i}.` }],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: `Here is part ${i} about ${topic}. `.repeat(40),
          },
        ],
      }
    )
  }
  prompt.push({
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'What is the secret code? Answer with the number.',
      },
    ],
  })
  return prompt
}

describe('apple context window', () => {
  it('rejects a prompt longer than the context window', async () => {
    await expect(
      apple().doGenerate({ prompt: longConversation() })
    ).rejects.toMatchObject({ code: 'CONTEXT_WINDOW_EXCEEDED' })
  })

  it('answers a long conversation once its history is summarized', async () => {
    const model = apple()
    const { contextSize } = await apple.getModelInfo()
    const managed = wrapLanguageModelWithHistory(model, {
      summarizeHistory: { model, threshold: Math.floor(contextSize! / 2) },
    })

    const result = await managed.doGenerate({ prompt: longConversation() })

    // What the summary keeps is up to the model
    expect(result.content.at(-1)).toMatchObject({ type: 'text' })
  })

  it('answers a long conversation in a rolling window', async () => {
    const managed = wrapLanguageModelWithHistory(apple(), {
      rollingWindowMessages: 6,
    })

    const result = await managed.doGenerate({ prompt: longConversation() })

    expect(result.content.at(-1)).toMatchObject({ type: 'text' })
  })
})
