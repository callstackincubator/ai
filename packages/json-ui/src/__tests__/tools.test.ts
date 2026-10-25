import { describe, expect, test } from 'bun:test'

import type { JsonUISpec } from '../registry'
import { createGenUITools } from '../tools'

function createTools() {
  let spec: JsonUISpec | null = {
    root: 'root',
    elements: { root: { type: 'Container', props: {}, children: [] } },
  }
  let nextId = 0
  const tools = createGenUITools({
    contextId: 'chat',
    getSpec: () => spec,
    updateSpec: (_, next) => {
      spec = next
    },
    createId: () => `node-${++nextId}`,
  })
  return { tools, getSpec: () => spec! }
}

const options = { toolCallId: 'call', messages: [] }

describe('addUINode', () => {
  test('accepts props written as a JavaScript object literal', async () => {
    const { tools, getSpec } = createTools()

    const result = await tools.addUINode.execute!(
      {
        type: 'Button',
        props: `{ text: "Tap me", style: { padding: 10 }, label: 'Go' }`,
      },
      options
    )

    expect(result).toEqual({ success: true, id: 'node-1' })
    expect(getSpec().elements['node-1'].props).toEqual({
      text: 'Tap me',
      style: { padding: 10 },
      label: 'Go',
    })
  })

  test('matches the type regardless of case', async () => {
    const { tools, getSpec } = createTools()

    await tools.addUINode.execute!({ type: 'HEADING' }, options)

    expect(getSpec().elements['node-1'].type).toBe('Heading')
  })

  test('rejects unknown types with the ones it supports', async () => {
    const { tools } = createTools()

    const result = await tools.addUINode.execute!({ type: 'Column' }, options)

    expect(result).toMatchObject({ success: false })
    expect((result as { message: string }).message).toContain('Heading')
  })
})
