# Getting Started

> [!NOTE]
> MLC support is experimental and not recommended for production use yet.

## Installation

```bash
npm install @react-native-ai/mlc
cd ios && pod install
```

## iOS Setup

Add the "Increased Memory Limit" capability in Xcode:
1. Open your iOS project in Xcode
2. Go to Signing & Capabilities tab
3. Add "Increased Memory Limit" capability

![Image](https://github.com/user-attachments/assets/0f8eec76-2900-48d9-91b8-ad7b3adce235)

## Available Models

The package includes a prebuilt runtime optimized for the following models:
- **Llama 3.2 3B** - General purpose chat, balanced performance
- **Phi-3 Mini 4K** - Coding assistance, technical tasks  
- **Mistral 7B** - Advanced reasoning (requires 8GB+ RAM)
- **Qwen 2.5 1.5B** - Fast responses, mobile-optimized

### Listing Models

Get the list of available models included in the runtime:

```typescript
import { getModels } from '@react-native-ai/mlc';

const models = await getModels();
console.log('Available models:', models);
```

### Downloading Models

Models need to be downloaded to the device before use. You can track download progress:

```typescript
import { downloadModel } from '@react-native-ai/mlc';

await downloadModel('Llama-3.2-3B-Instruct', {
  onStart: () => console.log('Download started...'),
  onProgress: (progress) => {
    console.log(`Progress: ${progress.percentage.toFixed(2)}%`);
  },
  onComplete: () => console.log('Download complete!'),
  onError: (error) => console.error('Download failed:', error),
});
```

### Preparing Models

After downloading, prepare the model for inference:

```typescript
import { prepareModel } from '@react-native-ai/mlc';

await prepareModel('Llama-3.2-3B-Instruct');
console.log('Model ready for inference!');
```

## Custom Models

If you need models beyond the prebuilt ones, you'll need to build your own runtime. See the [build script](https://github.com/callstackincubator/ai/blob/main/packages/mlc/scripts/build-runtime.sh) for implementation details. Full documentation for custom builds is coming soon.
