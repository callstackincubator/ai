# @react-native-ai/ncnn-wrapper

React Native wrapper for [NCNN](https://github.com/Tencent/ncnn) inference, compatible with the Vercel AI SDK.

## Features

- **Multiple models** – Load and run multiple NCNN models concurrently
- **Zero-copy** – Accept `ArrayBuffer` / `Float32Array` for efficient transfer (e.g. from [react-native-nitro-image](https://github.com/mrousavy/react-native-nitro-image))
- **Mutable tensors** – Modify tensor data in-place without reallocating
- **Cross-platform** – Android (Vulkan) and iOS (Metal/Vulkan)

## Installation

```bash
bun add @react-native-ai/ncnn-wrapper
```

### NCNN artifacts

Download NCNN prebuilt binaries before building:

```bash
# Android only
bun run download:ncnn:android

# iOS only
bun run download:ncnn:ios

# Both
bun run download:ncnn
```

### Android

The consuming app must register the C++ module in `OnLoad.cpp`:

```cpp
#include "NcnnWrapperModule.h"

std::shared_ptr<TurboModule> cxxModuleProvider(
    const std::string& name,
    const std::shared_ptr<CallInvoker>& jsInvoker) {
  if (name == NcnnWrapperModule::kModuleName) {
    return NcnnWrapperCxxModuleProvider(name, jsInvoker);
  }
  return autolinking_cxxModuleProvider(name, jsInvoker);
}
```

### iOS

Run `pod install` after downloading NCNN artifacts.

## Usage

```typescript
import {
  loadModel,
  getLoadedModels,
  runInference,
  createTensor,
  rgbBytesToFloatTensor,
} from '@react-native-ai/ncnn-wrapper'

// Load model (param + bin paths)
const model = loadModel('/path/to/model.param', '/path/to/model.bin')
if (!model) throw new Error('Failed to load model')

// Run inference with flat array
const result = runInference(model, [0.1, 0.2, 0.3, ...])
console.log(result.output, result.inferenceTime)

// Or with Tensor (supports mutable Float32Array)
const tensor = createTensor(new Float32Array(224 * 224 * 3), [1, 224, 224, 3])
result = runInference(model, tensor)

// Zero-copy from NitroImage
import { loadImage } from 'react-native-nitro-image'
const image = await loadImage({ filePath: '...' })
const pixelData = await image.toRawPixelData()
const tensor = rgbBytesToFloatTensor(pixelData, [1, image.height, image.width, 3])
result = runInference(model, tensor)

// Custom blob names (default: in0, out0)
result = model.runInference(tensor, {
  inputBlob: 'data',
  outputBlob: 'prob',
})
```

## API

### `loadModel(paramPath, binPath): Model | null`

Loads an NCNN model. Returns a `Model` instance or `null` on failure.

### `getLoadedModels(): Model[]`

Returns all currently loaded models.

### `runInference(model, input): RunInferenceResult`

Runs inference. `input` can be `number[]`, `Float32Array`, `ArrayBuffer`, or `Tensor`.

### `createTensor(data, shape): Tensor`

Creates a tensor. `data` can be `Float32Array`, `ArrayBuffer`, or `number[]`.

### `allocateTensor(shape): Tensor`

Allocates a new mutable tensor of the given shape.

### `rgbBytesToFloatTensor(buffer, shape): Tensor`

Converts NitroImage RGB `ArrayBuffer` to normalized float tensor `[0, 1]`.
