import { beforeEach, describe, expect, test } from 'bun:test'

import type { JsonUISpec } from '../registry'
import { createGenUITools } from '../tools'

function emptySpec(): JsonUISpec {
  return {
    root: 'root',
    elements: { root: { type: 'Column', props: {}, children: [] } },
  }
}

let spec: JsonUISpec
let ids: string[]
let tools: ReturnType<typeof createGenUITools>

function execute<T extends keyof ReturnType<typeof createGenUITools>>(
  name: T,
  args: Record<string, unknown> = {}
) {
  const definition = tools[name] as unknown as {
    execute: (input: unknown) => Promise<unknown>
  }
  return definition.execute(args)
}

beforeEach(() => {
  spec = emptySpec()
  ids = ['a', 'b', 'c', 'd', 'e', 'f']
  tools = createGenUITools({
    contextId: 'ctx',
    getSpec: () => spec,
    updateSpec: (_id, next) => {
      if (next) {
        spec = next
      }
    },
    createId: () => ids.shift() ?? 'x',
    nodeNamesThatSupportChildren: ['Column', 'Row'],
  })
})

describe('read tools', () => {
  test('getUIRootNode returns the root with typed children', async () => {
    spec.elements.header = { type: 'Text', props: { text: 'hi' }, children: [] }
    spec.elements.root.children = ['header']

    expect(await execute('getUIRootNode')).toEqual({
      root: {
        id: 'root',
        type: 'Column',
        props: {},
        children: [{ id: 'header', type: 'Text' }],
      },
    })
  })

  test('getUIRootNode reports missing specs as null', async () => {
    spec = { root: 'root', elements: {} }

    expect(await execute('getUIRootNode')).toEqual({ root: null })
  })

  test('getUINode resolves by id, defaults to root and reports unknown ids', async () => {
    spec.elements.card = { type: 'Button', props: {}, children: [] }

    expect(
      ((await execute('getUINode', {})) as { node: { id: string } }).node.id
    ).toBe('root')
    expect(
      ((await execute('getUINode', { id: 'card' })) as { node: { id: string } })
        .node.id
    ).toBe('card')
    expect(await execute('getUINode', { id: 'nope' })).toEqual({ node: null })
  })

  test('getUILayout exposes parent links and prop names only', async () => {
    spec.elements.header = {
      type: 'Text',
      props: { text: 'hi', fontSize: 20 },
      children: [],
    }
    spec.elements.root.children = ['header']

    const layout = (await execute('getUILayout')) as {
      root: string
      nodes: {
        id: string
        type: string
        parentId: string | null
        children: string[]
        props: string[]
      }[]
    }

    expect(layout.root).toBe('root')
    expect(layout.nodes).toEqual([
      {
        id: 'root',
        type: 'Column',
        parentId: null,
        children: ['header'],
        props: [],
      },
      {
        id: 'header',
        type: 'Text',
        parentId: 'root',
        children: [],
        props: ['text', 'fontSize'],
      },
    ])
  })

  test('getAvailableUINodes lists the node hints', async () => {
    const result = (await execute('getAvailableUINodes')) as {
      nodes: { name: string }[]
    }

    expect(result.nodes.map((node) => node.name)).toContain('Button')
  })
})

describe('addUINode', () => {
  test('attaches a new node to root by default', async () => {
    const result = (await execute('addUINode', {
      type: 'Text',
      props: '{"text":"hello"}',
    })) as { success: boolean; id: string }

    expect(result.success).toBe(true)
    expect(result.id).toBe('a')
    expect(spec.elements.a).toEqual({
      type: 'Text',
      props: { text: 'hello' },
      children: [],
    })
    expect(spec.elements.root.children).toEqual(['a'])
  })

  test('accepts an object props payload', async () => {
    await execute('addUINode', { type: 'Text', props: { text: 'obj' } })

    expect(spec.elements.a.props).toEqual({ text: 'obj' })
  })

  test('defaults to empty props', async () => {
    await execute('addUINode', { type: 'Text' })

    expect(spec.elements.a.props).toEqual({})
  })

  test('attaches to an explicit parent', async () => {
    spec.elements.column = { type: 'Column', props: {}, children: [] }
    spec.elements.root.children = ['column']

    await execute('addUINode', { parentId: 'column', type: 'Text' })

    expect(spec.elements.column.children).toEqual(['a'])
  })

  test('falls back to root when the parent cannot hold children', async () => {
    spec.elements.label = { type: 'Label', props: {}, children: [] }
    spec.elements.root.children = ['label']

    await execute('addUINode', { parentId: 'label', type: 'Text' })

    expect(spec.elements.label.children).toEqual([])
    expect(spec.elements.root.children).toEqual(['label', 'a'])
  })

  test('fails for unknown parents', async () => {
    expect(
      await execute('addUINode', { parentId: 'ghost', type: 'Text' })
    ).toEqual({
      success: false,
      message: 'Parent not found',
    })
  })

  test('fails when there is no spec', async () => {
    const failing = createGenUITools({
      contextId: 'ctx',
      getSpec: () => null,
      updateSpec: () => undefined,
      createId: () => 'a',
    })

    const definition = failing.addUINode as unknown as {
      execute: (input: unknown) => Promise<unknown>
    }

    expect(await definition.execute({ type: 'Text' })).toEqual({
      success: false,
      message: 'No UI spec',
    })
  })
})

describe('setUINodeProps', () => {
  test('merges props by default and replaces on request', async () => {
    spec.elements.node = {
      type: 'Text',
      props: { text: 'a', flex: 1 },
      children: [],
    }

    await execute('setUINodeProps', { id: 'node', props: '{"text":"b"}' })
    expect(spec.elements.node.props).toEqual({ text: 'b', flex: 1 })

    await execute('setUINodeProps', {
      id: 'node',
      props: { color: 'red' },
      replace: true,
    })
    expect(spec.elements.node.props).toEqual({ color: 'red' })
  })

  test('reports unknown nodes', async () => {
    expect(
      await execute('setUINodeProps', { id: 'ghost', props: '{}' })
    ).toEqual({ success: false, message: 'Node not found' })
  })
})

describe('deleteUINode', () => {
  test('removes the node and its reference in the parent', async () => {
    spec.elements.gone = { type: 'Text', props: {}, children: [] }
    spec.elements.root.children = ['gone']

    expect(await execute('deleteUINode', { id: 'gone' })).toEqual({
      success: true,
    })
    expect(spec.elements.gone).toBeUndefined()
    expect(spec.elements.root.children).toEqual([])
  })

  test('refuses to delete the root', async () => {
    expect(await execute('deleteUINode', { id: 'root' })).toEqual({
      success: false,
      message: 'Cannot delete root node',
    })
    expect(spec.elements.root).toBeDefined()
  })
})

describe('reorderUINodes', () => {
  beforeEach(() => {
    for (const [index, id] of ['one', 'two', 'three'].entries()) {
      spec.elements[id] = { type: 'Text', props: { index }, children: [] }
    }
    spec.elements.root.children = ['one', 'two', 'three']
  })

  test('moves a node down among its siblings', async () => {
    const result = (await execute('reorderUINodes', {
      nodeId: 'one',
      offset: 1,
    })) as { toIndex: number; childIds: string[] }

    expect(result.toIndex).toBe(1)
    expect(result.childIds).toEqual(['two', 'one', 'three'])
    expect(spec.elements.root.children).toEqual(['two', 'one', 'three'])
  })

  test('moves a node up among its siblings', async () => {
    const result = (await execute('reorderUINodes', {
      nodeId: 'three',
      offset: -2,
    })) as { childIds: string[]; appliedOffset: number }

    expect(result.childIds).toEqual(['three', 'one', 'two'])
    expect(result.appliedOffset).toBe(-2)
  })

  test('clamps offsets at both ends', async () => {
    const down = (await execute('reorderUINodes', {
      nodeId: 'two',
      offset: 99,
    })) as { childIds: string[]; appliedOffset: number }
    expect(down.childIds).toEqual(['one', 'three', 'two'])
    expect(down.appliedOffset).toBe(1)

    const up = (await execute('reorderUINodes', {
      nodeId: 'two',
      offset: -99,
    })) as { childIds: string[]; appliedOffset: number }
    expect(up.childIds).toEqual(['two', 'one', 'three'])
    expect(up.appliedOffset).toBe(-2)
  })

  test('zero offset is a no-op', async () => {
    const result = (await execute('reorderUINodes', {
      nodeId: 'two',
      offset: 0,
    })) as { toIndex: number; childIds: string[] }

    expect(result.toIndex).toBe(1)
    expect(result.childIds).toEqual(['one', 'two', 'three'])
  })

  test('requires an existing child', async () => {
    expect(
      await execute('reorderUINodes', { nodeId: 'ghost', offset: 1 })
    ).toEqual({
      success: false,
      message: 'nodeId must exist and have a parent',
    })
  })
})

describe('spec isolation', () => {
  test('tool reads never mutate the caller-owned spec', async () => {
    const original = emptySpec()
    original.elements.root.children = ['first']
    original.elements.first = {
      type: 'Text',
      props: { text: 'x' },
      children: [],
    }

    let writes = 0
    const isolated = createGenUITools({
      contextId: 'ctx',
      getSpec: () => original,
      updateSpec: () => {
        writes += 1
      },
      createId: () => 'new',
    })

    const addNode = isolated.addUINode as unknown as {
      execute: (input: unknown) => Promise<unknown>
    }
    await addNode.execute({ type: 'Text' })

    expect(writes).toBe(1)
    expect(original.elements.root.children).toEqual(['first'])
    expect(original.elements.new).toBeUndefined()
  })

  test('serialized mutations all land', async () => {
    const addNode = tools.addUINode as unknown as {
      execute: (input: unknown) => Promise<unknown>
    }

    await Promise.all([
      addNode.execute({ type: 'Text' }),
      addNode.execute({ type: 'Text' }),
      addNode.execute({ type: 'Text' }),
    ])

    expect(spec.elements.root.children).toEqual(['a', 'b', 'c'])
    expect(Object.keys(spec.elements)).toHaveLength(4)
  })
})
