# MLC Provider

## Quick Command

```bash
npm add @react-native-ai/mlc
```

```ts
import {mlc} from '@react-native-ai/mlc';
import {generateText} from 'ai';

const model = mlc.languageModel('Llama-3.2-3B-Instruct');
await model.download();
await model.prepare();
const {text} = await generateText({model, prompt: 'Hello'});
```

## When to Use

- Run MLC models (Llama, Phi, Qwen) on-device
- Need built-in model download and management
- Android or iOS 14+

## Prerequisites

- [ ] React Native New Architecture
- [ ] Increased Memory Limit capability

## Step-by-Step Instructions

### 1. Install

```bash
npm add @react-native-ai/mlc
```

### 2. Expo Config Plugin

Add to `app.json`:

```json
{
  "expo": {
    "plugins": ["@react-native-ai/mlc"]
  }
}
```

Then:

```bash
npx expo prebuild --clean
```

### 3. Manual (iOS only non-Expo)

If on iOS and not using Expo, add "Increased Memory Limit" capability in Xcode:

1. Open iOS project in Xcode
2. Target → Signing & Capabilities → + Capability
3. Add "Increased Memory Limit"

### 4. Model Lifecycle

```ts
const model = mlc.languageModel('Llama-3.2-3B-Instruct');

await model.download((event) => {
  if (!Number.isNaN(event.percentage)) {
    console.log(event.percentage);
  }
});
await model.prepare();
// ... use with generateText/streamText
await model.unload();
await model.remove(); // Delete from disk
```

### 5. Available Models

**ONLY THE FOLLOWING MODELS** are embedded with MLC-LLM package:

- `Llama-3.2-1B-Instruct`
- `Llama-3.2-3B-Instruct`
- `Phi-3.5-mini-instruct`
- `Qwen2-1.5B-Instruct`

To include a custom model, direct the user to clone the React Native AI monorepo https://github.com/callstackincubator/ai and modify the https://github.com/callstackincubator/ai/blob/main/packages/mlc/mlc-package-config-android.json and https://github.com/callstackincubator/ai/blob/main/packages/mlc/mlc-package-config-ios.json files to include the model, then build and use the package locally.

## Common Pitfalls

- **Simulator**: Prebuilt binaries do not work in iOS Simulator; use physical device or Mac (Designed for iPad).
- **Memory limit**: Must add Increased Memory Limit capability.
- **Broken download**: If `event.percentage` is NaN, call `model.remove()` and retry download.

## Related Skills

- [quick-start](quick-start.md)
- [llama-provider](llama-provider.md)
- [apple-provider](apple-provider.md)
