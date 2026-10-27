# Error Handling

Errors from the native module carry a `code`. Errors the JavaScript side throws, such as `createTensor` rejecting its elements, are plain `Error`s, so check `code` before relying on it. Errors that Core AI or a `coreai-models` runtime throws on their own, such as a model that fails to load, pass through with the `CORE_AI_ERROR` code and the runtime's message.

```typescript
import { generateText } from 'ai'

try {
  await generateText({ model, prompt })
} catch (error) {
  const { code } = error as { code?: string }

  if (code === 'CORE_AI_MISSING_SPM_PRODUCT') {
    // The task isn't linked: add it to the config plugin's tasks
  }

  throw error
}
```

With `streamText`, errors arrive as `error` parts in `fullStream`, with the same `code`.

## Error Codes

| Code                             | When                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CORE_AI_UNSUPPORTED_OS`         | The device runs an iOS older than 27                                                                                                                   |
| `CORE_AI_MISSING_SOURCE`         | The config has no `uri`, or no bundled resource with its `name`                                                                                        |
| `CORE_AI_MISSING_SPM_PRODUCT`    | The call needs a `coreai-models` product that isn't linked. The message names the task to add (see [Choosing Tasks](./getting-started#choosing-tasks)) |
| `CORE_AI_MODEL_NOT_LOADED`       | A model handle was unloaded, or never loaded                                                                                                           |
| `CORE_AI_SESSION_NOT_FOUND`      | A native session was closed, or its model unloaded                                                                                                     |
| `CORE_AI_UNSUPPORTED_TASK`       | `CoreAI.runTask` got a task it doesn't run                                                                                                             |
| `CORE_AI_INVALID_INPUT`          | An input or option doesn't match the model or the call. The message says what it takes                                                                 |
| `CORE_AI_CANCELLED`              | The abort signal or `cancelStream` stopped the call                                                                                                    |
| `CORE_AI_UNSUPPORTED_CAPABILITY` | The model can't do what the call asks, such as structured output from an engine without guided generation                                              |
| `CORE_AI_ERROR`                  | Core AI or a `coreai-models` runtime threw the error                                                                                                   |

## Models That Stop Loading

Core AI specializes a model for the device the first time it loads, and caches the result in the app's `Caches/coreai-cache` folder. If the app is killed while a model compiles, the cache entry can be left incomplete, and every later load of that model fails with `The operation couldn't be completed. (Foundation._GenericObjCError error 0.)`. Delete the folder, and the model compiles again on its next load:

```typescript
import { Directory, Paths } from 'expo-file-system'

const cache = new Directory(Paths.cache, 'coreai-cache')
if (cache.exists) cache.delete()
```
