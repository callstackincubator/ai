import { createAppleProvider } from '@react-native-ai/apple'
import { buildGenUISystemPrompt } from '@react-native-ai/json-ui'
import { generateText, isStepCount } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { addedNodes, createSpecTools } from './helpers'

describe('json-ui with apple', () => {
  // Foundation Models write props as object literals with unquoted keys and
  // type names in capitals, so no UI was added before the tools accepted them
  it('adds the requested nodes', async () => {
    const { tools, getSpec } = createSpecTools()
    const provider = createAppleProvider({ availableTools: tools })

    await generateText({
      model: provider(),
      tools,
      system: buildGenUISystemPrompt(),
      stopWhen: isStepCount(10),
      prompt: 'Add a heading that says Hello World and a button labeled Tap me',
    })

    const nodes = addedNodes(getSpec())
    expect(nodes, JSON.stringify(nodes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'Heading',
          props: expect.objectContaining({
            text: expect.stringMatching(/hello world/i),
          }),
        }),
        expect.objectContaining({
          type: 'Button',
          props: expect.objectContaining({
            text: expect.stringMatching(/tap me/i),
          }),
        }),
      ])
    )
  })
})
