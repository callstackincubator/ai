# Raw Function Calls

Any exported `.aimodel` runs through its functions, for models no task covers. Load it with the `raw` task, which needs no `coreai-models` product, and call a function by name with tensors:

```typescript
import { CoreAI, createTensor, readTensor } from '@react-native-ai/core-ai'

const { modelHandle, info } = await CoreAI.loadModel(
  { id: 'edsr-x2', sourceType: 'file', sourceUri: edsrModel, task: 'raw' },
  {}
)

// [{ name: 'main', inputs: [{ name: 'x', dataType: 'float16', shape: [-1, 3, -1, -1] }], outputs: [...] }]
console.log(info.functions)

const { outputs } = await CoreAI.runRawFunction(
  modelHandle,
  'main',
  { x: createTensor('float32', [1, 3, 64, 64], pixels) },
  {}
)

const upscaled = readTensor(outputs.output) // Float32Array of 1 × 3 × 128 × 128

await CoreAI.unloadModel(modelHandle)
```

`CoreAI.inspectModel(config)` lists the functions of an `.aimodel` on disk without running them. A shape of `-1` marks a dynamic dimension, which the input's `shape` sets.

## Tensors

Tensors are `{ dataType, shape, data }`, with `data` holding the little-endian elements in row-major order as base64:

- `createTensor(dataType, shape, elements)` makes one from a typed array or an array of numbers
- `readTensor(tensor)` returns its elements as a typed array: `Float32Array` for `float32`, `Int32Array` for `int32`, `BigInt64Array` for `int64`, and so on
- Data types: `float32`, `float16`, `bfloat16`, `float64`, `int8`, `int16`, `int32`, `int64`, `uint8`, `uint16`, `uint32`, `uint64` and `bool`

Hermes has no `Float16Array`, so float16 and bfloat16 inputs can be given as float32, and their outputs come back as float32. Pass `{ outputDataType: 'native' }` to `runRawFunction` to get the bits of each element instead (a `Uint16Array` from `readTensor`).

Shapes, data types and input names are checked against the function, with errors that say what it takes.

## Image Inputs

Inputs with `dataType: 'image'` take an image file instead of a tensor:

```typescript
// { name: 'image', dataType: 'image', width: 224, height: 224, pixelFormat: '32BGRA' }
console.log(info.functions[0].inputs[0])

const { outputs } = await CoreAI.runRawFunction(
  modelHandle,
  'main',
  { image: { imageUri: 'file:///path/to/photo.jpg' } },
  {}
)
```

The image is decoded with its EXIF orientation applied, and stretched to the input's `width` and `height` (a `-1` keeps the image's own) into a pixel buffer of its `pixelFormat`. `32BGRA`, `32ARGB` and `24RGB` inputs are supported, and other pixel formats are rejected. Alpha is premultiplied. Image outputs are not returned yet.

## Ownership and Performance

- Every call copies its inputs into new native arrays and copies its outputs out, so JavaScript never holds native memory and nothing outlives the call
- Functions load their weights on their first call and stay loaded until `CoreAI.unloadModel(modelHandle)`
- Core AI specializes the model for a compute unit when it loads. Pass `{ computeUnits: 'gpu' }` (or `'cpu'`, `'neural-engine'`) as the `loadModel` options to choose one, for example when the Neural Engine compiler rejects a model
- Base64 adds a third to the size of each tensor, and encoding runs on the JavaScript thread. For work that runs every frame, prefer a task, or keep tensors to a few megabytes
- Image inputs are decoded into a new pixel buffer on every call
