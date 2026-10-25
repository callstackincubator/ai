import { createGenUITools, type JsonUISpec } from '@react-native-ai/json-ui'

export const toolOptions = { toolCallId: 'call', messages: [], context: {} }

// JSON UI tools over a spec with an empty root, as the example app starts with
export function createSpecTools() {
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

// The nodes added under the root, without the root itself
export function addedNodes(spec: JsonUISpec) {
  return Object.entries(spec.elements)
    .filter(([id]) => id !== spec.root)
    .map(([, element]) => element)
}
