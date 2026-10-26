import { apple } from '@react-native-ai/apple'
import { describe, expect, it } from 'react-native-harness'

import { prompt } from './helpers'

// The Simulator does not have the model assets the Spotlight tool needs

describe('apple spotlight tool', () => {
  it('is supported', async () => {
    expect((await apple.getModelInfo()).supportsSpotlightTool).toBe(true)
  })

  it('answers with the Spotlight search tool', async () => {
    const result = await apple().doGenerate({
      prompt: prompt(
        'Search my notes for groceries and tell me what you find.'
      ),
      providerOptions: { apple: { builtInTools: ['spotlight'] } },
    })

    expect(result.content.some((part) => part.type === 'tool-call')).toBe(true)
    expect(result.content.some((part) => part.type === 'text')).toBe(true)
  })
})
