import { tool } from 'ai'
import { z } from 'zod'

import {
  DEFAULT_GEN_UI_ROOT_ID,
  GEN_UI_NODE_HINTS,
  GEN_UI_NODE_NAMES_THAT_SUPPORT_CHILDREN,
  type JsonUISpec,
} from './registry'

/**
 * Sometimes LLMs call tools with a string instead of an object.
 */
function smartParse(
  props: string | Record<string, unknown>
): Record<string, unknown> {
  return typeof props === 'string' ? JSON.parse(props) : props
}

const defaultCreateId = () =>
  `UI-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`

export type CreateGenTUIoolsOptions<TSpec extends JsonUISpec = JsonUISpec> = {
  contextId: string
  getSpec: (contextId: string) => TSpec | null
  updateSpec: (contextId: string, spec: TSpec | null) => void
  createId?: () => string
  rootId?: string
  nodeHints?: Record<string, string>
  nodeNamesThatSupportChildren?: readonly string[]
  toolWrapper?: <TArgs, TResult>(
    toolName: string,
    execute: (args: TArgs) => Promise<TResult>
  ) => (args: TArgs) => Promise<TResult>
}

const cloneSpec = <TSpec extends JsonUISpec>(spec: TSpec): TSpec =>
  ({
    ...spec,
    elements: Object.fromEntries(
      Object.entries(spec.elements).map(([id, element]) => [
        id,
        {
          ...element,
          props: { ...(element.props ?? {}) },
          children: [...(element.children ?? [])],
        },
      ])
    ),
  }) as TSpec

let mutationQueue: Promise<void> = Promise.resolve()

const withMutationLock = async <T>(run: () => Promise<T>): Promise<T> => {
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const previous = mutationQueue
  mutationQueue = mutationQueue.then(() => pending)

  await previous
  try {
    return await run()
  } finally {
    release()
  }
}

/**
 * Creates generative UI tools that read/update a JSON UI spec.
 */
export function createGenUITools<TSpec extends JsonUISpec = JsonUISpec>({
  contextId,
  getSpec,
  updateSpec,
  createId = defaultCreateId,
  rootId = DEFAULT_GEN_UI_ROOT_ID,
  nodeHints = GEN_UI_NODE_HINTS,
  nodeNamesThatSupportChildren = GEN_UI_NODE_NAMES_THAT_SUPPORT_CHILDREN,
  toolWrapper = (_, execute) => execute,
}: CreateGenTUIoolsOptions<TSpec>) {
  // Serialize mutating tool calls to avoid interleaving writes.
  let cachedSpec: TSpec | null = null

  const readSpec = (): TSpec | null => {
    if (cachedSpec) return cloneSpec(cachedSpec)
    const spec = getSpec(contextId)
    if (!spec) return null
    cachedSpec = cloneSpec(spec)
    return cloneSpec(cachedSpec)
  }

  const commitSpec = (spec: TSpec | null) => {
    cachedSpec = spec ? cloneSpec(spec) : null
    updateSpec(contextId, spec ? cloneSpec(spec) : null)
  }

  const getUIRootNode = tool({
    description:
      'Get the root node of the generative UI tree. Returns id, type, props, and children (array of { id, type }). Root always exists with id "root".',
    inputSchema: z.object({}),
    execute: toolWrapper('getUIRootNode', async () => {
      const spec = readSpec()
      if (!spec?.root || !spec.elements[spec.root]) return { root: null }
      const element = spec.elements[spec.root]
      const children = (element.children ?? []).map((id) => ({
        id,
        type: spec.elements[id]?.type ?? 'unknown',
      }))
      return {
        root: {
          id: spec.root,
          type: element.type,
          props: element.props,
          children,
        },
      }
    }),
  })

  const getUINode = tool({
    description:
      'Get a node by id. Returns id, type, props, and children (array of { id, type }). If id is omitted, returns root node.',
    inputSchema: z.object({
      id: z.string().optional().describe('Node id; omit for root'),
    }),
    execute: toolWrapper('getUINode', async ({ id }) => {
      const spec = readSpec()
      if (!spec) return { node: null }
      const nodeId = id ?? spec.root
      const element = spec.elements[nodeId]
      if (!element) return { node: null }
      const children = (element.children ?? []).map((childId) => ({
        id: childId,
        type: spec.elements[childId]?.type ?? 'unknown',
      }))
      return {
        node: {
          id: nodeId,
          type: element.type,
          props: element.props,
          children,
        },
      }
    }),
  })

  const getUILayout = tool({
    description: 'Get compact UI layout.',
    inputSchema: z.object({}),
    execute: toolWrapper('getUILayout', async () => {
      const spec = readSpec()
      if (!spec) return { root: null, nodes: [] }

      const parentByChild: Record<string, string | null> = {}
      for (const [id, element] of Object.entries(spec.elements)) {
        for (const childId of element.children ?? []) {
          parentByChild[childId] = id
        }
      }

      const nodes = Object.entries(spec.elements).map(([id, element]) => ({
        id,
        type: element.type,
        parentId: parentByChild[id] ?? null,
        children: element.children ?? [],
        props: Object.keys(element.props ?? {}),
      }))

      return { root: spec.root, nodes }
    }),
  })

  const getAvailableUINodes = tool({
    description: 'List nodes + props.',
    inputSchema: z.object({}),
    execute: toolWrapper('getAvailableUINodes', async () => ({
      nodes: Object.entries(nodeHints).map(([name, props]) => ({
        name,
        props,
      })),
    })),
  })

  const setUINodeProps = tool({
    description: 'Set or add props for a node by id.',
    inputSchema: z.object({
      id: z.string().describe('Node id'),
      props: z.string().describe('Props object for the node'),
      replace: z.boolean().optional().describe('Replace existing props'),
    }),
    execute: toolWrapper(
      'setUINodeProps',
      async ({ id, props: propsArg, replace = false }) =>
        withMutationLock(async () => {
          const parsedProps = smartParse(propsArg)
          const spec = readSpec()
          if (!spec) return { success: false, message: 'No UI spec' }
          if (!spec.elements[id]) {
            return { success: false, message: 'Node not found' }
          }

          const elements = { ...spec.elements }
          const current = elements[id]
          const nextProps = replace
            ? parsedProps
            : { ...current.props, ...parsedProps }

          elements[id] = { ...current, props: nextProps }

          commitSpec({ root: spec.root, elements } as TSpec)
          return { success: true }
        })
    ),
  })

  const deleteUINode = tool({
    description:
      'Delete a node by id. Cannot delete the root node (id "root"). Removes the node and its reference from the parent\'s children.',
    inputSchema: z.object({
      id: z.string().describe('Node id to delete'),
    }),
    execute: toolWrapper('deleteUINode', async ({ id }) =>
      withMutationLock(async () => {
        if (id === rootId) {
          return { success: false, message: 'Cannot delete root node' }
        }
        const spec = readSpec()
        if (!spec) return { success: false, message: 'No UI spec' }
        const elements = { ...spec.elements }
        delete elements[id]
        for (const key of Object.keys(elements)) {
          const element = elements[key]
          if (element.children?.includes(id)) {
            elements[key] = {
              ...element,
              children: element.children.filter((childId) => childId !== id),
            }
          }
        }
        commitSpec({ root: spec.root, elements } as TSpec)
        return { success: true }
      })
    ),
  })

  const addUINode = tool({
    description:
      'Add a new node as a child of parentId. Creates element with type and props. Returns new node id. Props must be a valid JSON object.',
    inputSchema: z.object({
      parentId: z.string().optional().describe('Parent node id; omit for root'),
      type: z
        .string()
        .describe('Component type (e.g. Container, Column, Text, Button)'),
      props: z.string().optional().describe('Props object for the node'),
    }),
    execute: toolWrapper(
      'addUINode',
      async ({ parentId, type, props: propsArg }) =>
        withMutationLock(async () => {
          const parsedProps = smartParse(propsArg ?? '{}')
          const spec = readSpec()
          if (!spec) {
            console.warn(
              '[@react-native-ai/json-ui tool addNode] No UI spec, aborting'
            )

            return { success: false, message: 'No UI spec' }
          }

          parentId ??= spec.root

          if (!spec.elements[parentId]) {
            console.warn(
              '[@react-native-ai/json-ui tool addNode] Parent not found, aborting'
            )
            return { success: false, message: 'Parent not found' }
          }

          const newId = createId()
          spec.elements[newId] = {
            type,
            props: parsedProps ?? {},
            children: [],
          }
          let parent = spec.elements[parentId]

          if (!nodeNamesThatSupportChildren.includes(parent.type)) {
            parent = spec.elements[spec.root]
            parentId = spec.root
          }

          spec.elements[parentId].children ??= []
          spec.elements[parentId].children!.push(newId)

          commitSpec({
            root: spec.root,
            elements: spec.elements,
          } as TSpec)
          return { success: true, id: newId }
        })
    ),
  })

  const reorderUINodes = tool({
    description:
      'Move one node among siblings by offset (negative = up, positive = down).',
    inputSchema: z.object({
      nodeId: z.string().describe('Node id to move'),
      offset: z
        .number()
        .describe(
          'Relative index shift among siblings; negative moves earlier, positive moves later'
        ),
    }),
    execute: toolWrapper('reorderUINodes', async ({ nodeId, offset }) =>
      withMutationLock(async () => {
        const spec = readSpec()
        if (!spec) return { success: false, message: 'No UI spec' }

        const findParentId = (childId: string) => {
          for (const [id, element] of Object.entries(spec.elements)) {
            if (element.children?.includes(childId)) return id
          }
          return null
        }

        const nodeParentId = findParentId(nodeId)
        if (!nodeParentId) {
          return {
            success: false,
            message: 'nodeId must exist and have a parent',
          }
        }

        const parentId = nodeParentId
        const parent = spec.elements[parentId]
        if (!parent) return { success: false, message: 'Parent not found' }

        const currentChildren = [...(parent.children ?? [])]
        const nodeIndex = currentChildren.indexOf(nodeId)
        if (nodeIndex === -1) {
          return {
            success: false,
            message: 'nodeId must be a direct child',
          }
        }

        if (offset === 0) {
          return {
            success: true,
            parentId,
            nodeId,
            fromIndex: nodeIndex,
            toIndex: nodeIndex,
            appliedOffset: 0,
            childIds: currentChildren,
          }
        }

        const maxIndex = currentChildren.length - 1
        const toIndex = Math.min(Math.max(nodeIndex + offset, 0), maxIndex)
        currentChildren.splice(nodeIndex, 1)
        currentChildren.splice(toIndex, 0, nodeId)

        const elements = { ...spec.elements }
        elements[parentId].children = currentChildren
        commitSpec({ root: spec.root, elements } as TSpec)

        return {
          success: true,
          parentId,
          nodeId,
          fromIndex: nodeIndex,
          toIndex,
          appliedOffset: toIndex - nodeIndex,
          childIds: currentChildren,
        }
      })
    ),
  })

  return {
    getUIRootNode,
    getUINode,
    getUILayout,
    getAvailableUINodes,
    setUINodeProps,
    deleteUINode,
    addUINode,
    reorderUINodes,
  }
}
