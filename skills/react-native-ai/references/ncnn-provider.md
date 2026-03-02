# NCNN Provider

## Quick Command

```bash
npm add @react-native-ai/ncnn-wrapper
```

```ts
import {
  loadModel,
  runInference,
  toFlatArray,
} from '@react-native-ai/ncnn-wrapper';

await loadModel(modelPath, paramPath); // .bin and .param paths
const result = runInference([1, 2, 3]);
```

## When to Use

- Low-level NCNN inference in React Native
- Custom vision or other NCNN models
- Need direct control over model loading and inference

## Prerequisites

- [ ] React Native >= 0.76.0
- [ ] NCNN model files (.param, .bin)
- [ ] Expo optional (config plugin available)
- [ ] Android, iOS, MacOS, Linux or Windows

## Step-by-Step Instructions

### 1. Install

```bash
npm add @react-native-ai/ncnn-wrapper
```

### 2. Load Model

```ts
import {loadModel} from '@react-native-ai/ncnn-wrapper';

await loadModel(paramPath, binPath);
```

### 3. Run Inference

```ts
import {runInference, toFlatArray} from '@react-native-ai/ncnn-wrapper';

// Input as number[] or Tensor
const output = runInference([1, 2, 3]);
// or
const output = runInference(toFlatArray(tensor));
```

### 4. Tensor Utilities

```ts
import {
  createTensor,
  fromFlatArray,
  tensorSize,
  toFlatArray,
  type Tensor,
} from '@react-native-ai/ncnn-wrapper';
```

### 5. Model Info

```ts
import {getModelInfo} from '@react-native-ai/ncnn-wrapper';

const info = getModelInfo();
```

## Common Pitfalls

- **Not a full AI SDK provider**: NCNN wrapper is lower-level; no generateText/streamText. Use for custom inference pipelines.
- **Model paths**: Ensure .param and .bin paths are correct and accessible.

## Related Skills

- [quick-start](quick-start.md)
- [llama-provider](llama-provider.md)
- [mlc-provider](mlc-provider.md)
