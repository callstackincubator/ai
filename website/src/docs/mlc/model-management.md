# Model Management

This guide covers the complete lifecycle of MLC models - from discovery and download to cleanup and removal.

## Available Models

The package includes a prebuilt runtime optimized for the following models:

| Model ID | Size | Best For |
|----------|------|----------|
| `Qwen2.5-0.5B-Instruct` | ~600MB | Fast responses, basic conversations |
| `Llama-3.2-1B-Instruct` | ~1.2GB | Balanced performance and quality |
| `Llama-3.2-3B-Instruct` | ~2GB | High quality responses, complex reasoning |
| `Phi-3.5-mini-instruct` | ~2.3GB | Code generation, technical tasks |

> **Note**: These models use q4f16_1 quantization (4-bit weights, 16-bit activations) optimized for mobile devices. For other models, you'll need to build MLC from source (documentation coming soon).

## Model Lifecycle

### Discovering Models

Get the list of models included in the runtime:

```typescript
import { MLCEngine } from '@react-native-ai/mlc';

const models = await MLCEngine.getModels();

console.log('Available models:', models);
// Output: [{ model_id: 'Llama-3.2-1B-Instruct' }, ...]
```

### Creating Model Instance

Create a model instance using the `mlc.languageModel()` method:

```typescript
import { mlc } from '@react-native-ai/mlc';

const model = mlc.languageModel('Llama-3.2-1B-Instruct');
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
  console.log(`Download: ${event.percentage}%`);
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
