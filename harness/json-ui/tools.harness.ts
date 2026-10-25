import { buildGenUISystemPrompt } from '@react-native-ai/json-ui'
import { asSchema } from 'ai'
import { describe, expect, it } from 'react-native-harness'

import { createSpecTools, toolOptions } from './helpers'

describe('json-ui tools', () => {
  it('accepts props written as a JavaScript object literal', async () => {
    const { tools, getSpec } = createSpecTools()

    const result = await tools.addUINode.execute!(
      {
        type: 'Button',
        props: `{ text: "Tap me", style: { padding: 10 }, label: 'Go' }`,
      },
      toolOptions
    )

    expect(result).toEqual({ success: true, id: 'node-1' })
    expect(getSpec().elements['node-1'].props).toEqual({
      text: 'Tap me',
      style: { padding: 10 },
      label: 'Go',
    })
  })

  it('accepts object literal props when setting props', async () => {
    const { tools, getSpec } = createSpecTools()
    await tools.addUINode.execute!({ type: 'Text' }, toolOptions)

    await tools.setUINodeProps.execute!(
      { id: 'node-1', props: `{ text: 'It\\'s here' }` },
      toolOptions
    )

    expect(getSpec().elements['node-1'].props).toEqual({ text: "It's here" })
  })

  // A thrown error ends the generation on Apple, so the model could not retry
  it('returns the expected format for invalid props', async () => {
    const { tools, getSpec } = createSpecTools()

    const result = await tools.addUINode.execute!(
      { type: 'Text', props: '{ onPress: () => () }' },
      toolOptions
    )

    expect(result).toMatchObject({ success: false })
    expect((result as { message: string }).message).toContain(
      '{"text":"Hello"}'
    )
    expect(getSpec().elements.root.children).toEqual([])
  })

  it('matches the type regardless of case', async () => {
    const { tools, getSpec } = createSpecTools()

    await tools.addUINode.execute!({ type: 'HEADING' }, toolOptions)

    expect(getSpec().elements['node-1'].type).toBe('Heading')
  })

  it('rejects unknown types with the ones it supports', async () => {
    const { tools, getSpec } = createSpecTools()

    const result = await tools.addUINode.execute!(
      { type: 'Column' },
      toolOptions
    )

    expect(result).toMatchObject({ success: false })
    expect((result as { message: string }).message).toContain('Heading')
    expect(getSpec().elements.root.children).toEqual([])
  })

  it('lists the supported types in the addUINode description', async () => {
    const { tools } = createSpecTools()

    const description = JSON.stringify(
      await asSchema(tools.addUINode.inputSchema).jsonSchema
    )

    expect(description).toContain('Heading')
    expect(description).not.toContain('Container')
  })

  it('names only tools that exist in the system prompt', () => {
    const { tools } = createSpecTools()

    const named = buildGenUISystemPrompt().match(/\b(?:get|set|add)\w*UI\w*/g)

    expect(named?.length).toBeGreaterThan(0)
    for (const name of named ?? []) {
      expect(Object.keys(tools)).toContain(name)
    }
  })
})
