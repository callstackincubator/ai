import { tool } from 'ai'
import { z } from 'zod'

import {
  DEFAULT_GEN_UI_ROOT_ID,
  GEN_UI_NODE_HINTS,
  GEN_UI_NODE_NAMES_THAT_SUPPORT_CHILDREN,
  type JsonUISpec,
} from './registry'

type ToolExecutionReporter = (event: {
  toolName: string
  args: unknown
}) => void

let toolExecutionReporter: ToolExecutionReporter | null = null

export function setToolExecutionReporter(
  reporter: ToolExecutionReporter | null
) {
  toolExecutionReporter = reporter
}

/**
 * Sometimes LLMs call tools with a string instead of an object.
 */
function smartParse(
  props: string | Record<string, unknown>
): Record<string, unknown> {
  return typeof props === 'string' ? JSON.parse(props) : props
}

/**
 * Wraps a tool execute function: on throw, logs the error and returns { error: message }.
 */
function withToolErrorHandler<TArgs, TResult>(
  toolName: string,
  execute: (args: TArgs) => Promise<TResult>
): (args: TArgs) => Promise<TResult | { error: string }> {
  return async (args: TArgs) => {
    try {
      console.log('[json-ui-lite-rn] Executing tool', toolName, args)
      try {
        toolExecutionReporter?.({ toolName, args })
      } catch (reportError) {
        console.warn(
          '[json-ui-lite-rn] Failed to report tool execution',
          reportError
        )
      }
      return await execute(args)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[json-ui-lite-rn tool ${toolName}]`, error)
      return { error: message }
    }
  }
}

const defaultCreateId = () =>
  `UI-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`

export type CreateUIToolsOptions<TSpec extends JsonUISpec = JsonUISpec> = {
  contextId: string
  getSpec: (contextId: string) => TSpec | null
  updateSpec: (contextId: string, spec: TSpec | null) => void
  createId?: () => string
  rootId?: string
  nodeHints?: Record<string, string>
  nodeNamesThatSupportChildren?: readonly string[]
}

/**
 * Creates generative UI tools that read/update a JSON UI spec.
 */
export function createUITools<TSpec extends JsonUISpec = JsonUISpec>({
  contextId,
  getSpec,
  updateSpec,
  createId = defaultCreateId,
  rootId = DEFAULT_GEN_UI_ROOT_ID,
  nodeHints = GEN_UI_NODE_HINTS,
  nodeNamesThatSupportChildren = GEN_UI_NODE_NAMES_THAT_SUPPORT_CHILDREN,
}: CreateUIToolsOptions<TSpec>) {
  let specCache = getSpec(contextId)

  const readSpec = () => {
    const latest = getSpec(contextId)
    if (latest) specCache = latest
    return specCache
  }

  const writeSpec = (nextSpec: TSpec) => {
    specCache = nextSpec
    updateSpec(contextId, nextSpec)
  }

  // Serialize mutating tool calls to avoid interleaving writes.
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

  const getUIRootNode = tool({
    description:
      'Get the root node of the generative UI tree. Returns id, type, props, and children (array of { id, type }). Root always exists with id "root".',
    inputSchema: z.object({}),
    execute: withToolErrorHandler('getUIRootNode', async () => {
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
    execute: withToolErrorHandler('getUINode', async ({ id }) => {
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
    execute: withToolErrorHandler('getUILayout', async () => {
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
    execute: withToolErrorHandler('getAvailableUINodes', async () => ({
      nodes: Object.entries(nodeHints).map(([name, props]) => ({
        name,
        props,
      })),
    })),
  })

  const setUINodeProps = tool({
    description: 'Set or merge props for a node by id.',
    inputSchema: z.object({
      id: z.string().describe('Node id'),
      props: z.string().describe('Props object for the node'),
      merge: z.boolean().optional().describe('Merge with existing props'),
    }),
    execute: withToolErrorHandler(
      'setUINodeProps',
      async ({ id, props: propsArg, merge = true }) =>
        withMutationLock(async () => {
          const parsedProps = smartParse(propsArg)
          const spec = readSpec()
          if (!spec) return { success: false, message: 'No UI spec' }
          if (!spec.elements[id]) {
            return { success: false, message: 'Node not found' }
          }

          const elements = { ...spec.elements }
          const current = elements[id]
          const nextProps = merge
            ? { ...current.props, ...parsedProps }
            : parsedProps
          elements[id] = { ...current, props: nextProps }

          writeSpec({ root: spec.root, elements } as TSpec)
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
    execute: withToolErrorHandler('deleteUINode', async ({ id }) =>
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
        writeSpec({ root: spec.root, elements } as TSpec)
        return { success: true }
      })
    ),
  })

  const addUINode = tool({
    description:
      'Add a new node as a child of parentId. Creates element with type and props. Returns new node id. Props must be a valid JSON object.',
    inputSchema: z.object({
      parentId: z.string().describe('Parent node id'),
      type: z
        .string()
        .describe('Component type (e.g. Container, Column, Text, Button)'),
      props: z.string().optional().describe('Props object for the node'),
    }),
    execute: withToolErrorHandler(
      'addUINode',
      async ({ parentId, type, props: propsArg }) =>
        withMutationLock(async () => {
          const parsedProps = smartParse(propsArg ?? '{}')
          const spec = readSpec()
          if (!spec) {
            console.warn('[json-ui-lite-rn tool addNode] No UI spec, aborting')

            return { success: false, message: 'No UI spec' }
          }
          if (!spec.elements[parentId]) {
            console.warn(
              '[json-ui-lite-rn tool addNode] Parent not found, aborting'
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

          writeSpec({ root: spec.root, elements: spec.elements } as TSpec)
          return { success: true, id: newId }
        })
    ),
  })

  const reorderUINodes = tool({
    description:
      'Move one node before or after an anchor node among siblings. Call ',
    inputSchema: z.object({
      nodeId: z.string().describe('Node id to move'),
      anchorId: z.string().describe('Sibling node id used as anchor'),
      mode: z
        .enum(['pre', 'post'])
        .describe('Insert mode: pre = before anchor, post = after anchor'),
    }),
    execute: withToolErrorHandler(
      'reorderUINodes',
      async ({ nodeId, anchorId, mode }) =>
        withMutationLock(async () => {
          const spec = readSpec()
          if (!spec) return { success: false, message: 'No UI spec' }
          if (nodeId === anchorId) {
            return {
              success: false,
              message: 'nodeId and anchorId must be different',
            }
          }

          const findParentId = (childId: string) => {
            for (const [id, element] of Object.entries(spec.elements)) {
              if (element.children?.includes(childId)) return id
            }
            return null
          }

          const nodeParentId = findParentId(nodeId)
          const anchorParentId = findParentId(anchorId)
          if (!nodeParentId || !anchorParentId) {
            return {
              success: false,
              message:
                'Both nodeId and anchorId must exist and have the same parent',
            }
          }
          if (nodeParentId !== anchorParentId) {
            return {
              success: false,
              message: 'nodeId and anchorId must be siblings',
            }
          }

          const parentId = nodeParentId
          const parent = spec.elements[parentId]
          if (!parent) return { success: false, message: 'Parent not found' }

          const currentChildren = [...(parent.children ?? [])]
          const nodeIndex = currentChildren.indexOf(nodeId)
          const anchorIndex = currentChildren.indexOf(anchorId)
          if (nodeIndex === -1 || anchorIndex === -1) {
            return {
              success: false,
              message: 'nodeId and anchorId must both be direct children',
            }
          }

          currentChildren.splice(nodeIndex, 1)
          const anchorIndexAfterRemoval = currentChildren.indexOf(anchorId)
          const insertIndex =
            mode === 'pre'
              ? anchorIndexAfterRemoval
              : anchorIndexAfterRemoval + 1
          currentChildren.splice(insertIndex, 0, nodeId)

          const elements = { ...spec.elements }
          elements[parentId].children = currentChildren
          writeSpec({ root: spec.root, elements } as TSpec)

          return {
            success: true,
            parentId,
            nodeId,
            anchorId,
            mode,
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
