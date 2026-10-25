import { buildGenUISystemPrompt } from '@react-native-ai/json-ui'
import { generateText, isStepCount } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { setupLanguageModel } from '../llama/helpers'
import { addedNodes, createSpecTools } from './helpers'

const model = setupLanguageModel({ vision: false })

describe('json-ui with llama', () => {
  it('adds the requested nodes', async () => {
    const { tools, getSpec } = createSpecTools()

    await generateText({
      model: model(),
      tools,
      reasoning: 'none',
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
