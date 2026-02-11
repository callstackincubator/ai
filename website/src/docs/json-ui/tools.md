# Tools

`createGenUITools` returns a set of tool definitions the model can call to read and mutate a JSON UI spec.

## createGenUITools(options)

Creates tools that operate on a spec with shape `{ root, elements }`. Options:

| Option                           | Required | Description                                                             |
| -------------------------------- | -------- | ----------------------------------------------------------------------- |
| `contextId`                      | Yes      | String key for the current conversation/context                         |
| `getSpec(contextId)`             | Yes      | Return current spec or `null`                                           |
| `updateSpec(contextId, spec)`    | Yes      | Persist the updated spec                                                |
| `toolWrapper(toolName, execute)` | Yes      | Wrapper for every tool execution (logging, error handling, telemetry)   |
| `createId`                       | No       | Id factory for new nodes (default: generates `UI-{timestamp}-{random}`) |
| `rootId`                         | No       | Root node id (default: `"root"`)                                        |
| `nodeHints`                      | No       | Override component registry used in prompts                             |
| `nodeNamesThatSupportChildren`   | No       | Override list of node types that can have children                      |

### Tool list

- **getUIRootNode** — Return the root node id and element
- **getUINode** — Return a node by id
- **getUILayout** — Return layout (root + children structure)
- **getAvailableUINodes** — List available node types and hints
- **setUINodeProps** — Set props on a node (`{ id, props, replace? }`; default merge, use `replace: true` to replace all)
- **deleteUINode** — Remove a node
- **addUINode** — Add a node (`{ parentId?, type, props? }`; omit `parentId` to use root)
- **reorderUINodes** — Move a sibling by index (`nodeId`, `offset`; negative = earlier, positive = later; clamped to valid range)

All mutations are serialized so concurrent tool calls do not interleave writes.

## buildGenUISystemPrompt(options?)

Builds the reusable system instructions for JSON UI tooling. Use as the `system` option for `streamText` / `generateText`.

Options:

| Option                               | Default | Description                                                      |
| ------------------------------------ | ------- | ---------------------------------------------------------------- |
| `additionalInstructions`             | —       | App-specific text appended to the prompt                         |
| `requireLayoutReadBeforeAddingNodes` | `true`  | Whether to instruct the model to read layout before adding nodes |
| `styleHints`                         | —       | Override style metadata used in the prompt text                  |

Example:

```ts
system: buildGenUISystemPrompt({
  additionalInstructions:
    'Your name is John. Prefer short labels. Use Button for primary actions only.',
  styleHints: {
    borderRadius: { type: 'number', description: 'Border radius in px.' },
  },
})
```
