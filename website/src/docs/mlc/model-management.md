# Model Management

This guide covers the complete lifecycle of MLC models - from discovery and download to cleanup and removal.

## Available Models

The package includes a prebuilt runtime optimized for the following models:

| Model | Model ID | Size | Use Case |
|-------|----------|------|----------|
| **Llama 3.2 3B** | `Llama-3.2-3B-Instruct` | ~2GB | General purpose chat, balanced performance |
| **Phi-3 Mini 4K** | `Phi-3-mini-4k-instruct` | ~2.5GB | Coding assistance, technical tasks |
| **Mistral 7B** | `Mistral-7B-Instruct` | ~4.5GB | Advanced reasoning (requires 8GB+ RAM) |
| **Qwen 2.5 1.5B** | `Qwen2.5-1.5B-Instruct` | ~1GB | Fast responses, mobile-optimized |

> **Note**: These are the only models supported for direct download. For other models, you'll need to build MLC from source (documentation coming soon).

## Model Lifecycle

### Discovering Models

Get the list of models included in the runtime:

```typescript
import { MLCEngine } from '@react-native-ai/mlc';

const models = await MLCEngine.getModels();

console.log('Available models:', models);
// Output: [{ model_id: 'Llama-3.2-3B-Instruct' }, ...]
```

### Creating Model Instance

Create a model instance using the `mlc.languageModel()` method:

```typescript
import { mlc } from '@react-native-ai/mlc';

const model = mlc.languageModel('Llama-3.2-3B-Instruct');
```

### Downloading Models

Models need to be downloaded to the device before use.

```typescript
import { MLCEngine } from '@react-native-ai/mlc';

await model.download();

console.log('Download complete!');
```

You can track download progress:

```typescript
await model.download((event) => {
  console.log(`Download: ${event.status}`);
});
```

### Preparing Models

After downloading, prepare the model for inference:

```typescript
await model.prepare();
```

### Using Models

Once prepared, use the model with AI SDK functions:

```typescript
import { generateText } from 'ai';

const result = await generateText({
  model,
  prompt: 'Hello! Introduce yourself briefly.',
});

console.log(result.text);
```

### Unloading Models

Unload the current model from memory to free resources:

```typescript
await model.unload();
```

### Removing Downloaded Models

Delete downloaded model files to free storage:

```typescript
await model.remove();
```
