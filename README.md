<h1 align="center">`react-native-ai</h1>

<p align="center">
  <strong>Run LLMs locally in React Native app via Universal [MLC LLM Engine](https://github.com/mlc-ai/mlc-llm) with compatibility for [Vercel AI SDK](https://sdk.vercel.ai/docs/).</strong><br>
</p>

<div align="center">

[![mit licence](https://img.shields.io/dub/l/vibe-d.svg?style=for-the-badge)](https://github.com/callstackincubator/ai/blob/main/LICENSE)
[![npm version](https://img.shields.io/npm/v/react-native-bottom-tabs?style=for-the-badge)](https://www.npmjs.org/package/react-native-ai)
[![npm downloads](https://img.shields.io/npm/dt/react-native-bottom-tabs.svg?style=for-the-badge)](https://www.npmjs.org/package/react-native-ai)
[![npm downloads](https://img.shields.io/npm/dm/react-native-bottom-tabs.svg?style=for-the-badge)](https://www.npmjs.org/package/react-native-ai)

</div>

## Installation

#### 1. Install the package

```
npm install react-native-ai
```

#### 2. Clone MLC LLM Engine repository and set environment variable.

```
git clone https://github.com/mlc-ai/mlc-llm
cd mlc-llm
git submodule update --init --recursive
MLC_LLM_SOURCE_DIR=$(pwd) // Add this to your environment variables e.g. in .zshrc
```

> [!IMPORTANT]
> Ensure that `mlc_llm` works and `MLC_LLM_SOURCE_DIR` is set in your environment variables.

#### 3. Install `mlc_llm` CLI:

To install `mlc_llm` CLI, please follow steps described [in the official guide](https://llm.mlc.ai/docs/install/mlc_llm.html).

To ensure that CLI is installed correctly, run the following command:

```
mlc_llm
```

If you see any output then it means that CLI is installed correctly.

#### 4. Add `mlc-config.json` with models and other properties to root directory of your project:

```js
{
  "iphone": [
    {
      "model": "MODEL_NAME",
      "model_id": "MODEL_ID",
      // "estimated_vram_bytes": 3043000000
    }
  ],
  "android": [
    {
      "model": "MODEL_NAME",
      "model_id": "MODEL_ID",
      // "estimated_vram_bytes": 3043000000
    }
  ]
}
```

Read more about configuration for [Android](https://llm.mlc.ai/docs/deploy/android.html#customize-the-app) and for [iOS](https://llm.mlc.ai/docs/deploy/ios.html#customize-the-app).

You can also check out [example config](https://github.com/callstackincubator/ai/blob/main/example/mlc-config.json) in the repository.

#### 4. **[Android only]**

If you want to execute models also on Android you need to set `ANDROID_NDK` and `TVM_NDK_CC` environment variables. Everything is described in [MLC LLM docs](https://llm.mlc.ai/docs/deploy/android.html#id2).

#### 5. **[iOS only]** If you want to execute models also on iOS you need to:

- Add "Increased Memory Limit" capability inside your Xcode project inside Signing & Capabilities tab.
  ![Image](https://github.com/user-attachments/assets/0f8eec76-2900-48d9-91b8-ad7b3adce235)
- Install Cocoapods:
  ```
  cd ios && pod install
  ```

#### 6. Run the following command to prepare binaries and static libraries for the project

```
npx react-native-ai mlc-prepare
```

#### 7. Add missing polyfills

To make the Vercel AI SDK work in your project, you should include polyfills by first installing these pacakges:

```
npm install @azure/core-asynciterator-polyfill @ungap/structured-clone web-streams-polyfill text-encoding
```

and creating `polyfills.ts` file which will contain following imports:

```js
import '@azure/core-asynciterator-polyfill';
import structuredClone from '@ungap/structured-clone';
import { polyfillGlobal } from 'react-native/Libraries/Utilities/PolyfillFunctions';

const webStreamPolyfills = require('web-streams-polyfill/ponyfill/es6');

polyfillGlobal('TextEncoder', () => require('text-encoding').TextEncoder);
polyfillGlobal('ReadableStream', () => webStreamPolyfills.ReadableStream);
polyfillGlobal('TransformStream', () => webStreamPolyfills.TransformStream);
polyfillGlobal('WritableStream', () => webStreamPolyfills.WritableStream);
polyfillGlobal('TextEncoderStream', () => webStreamPolyfills.TextEncoderStream);
polyfillGlobal('structuredClone', () => structuredClone);
```

Make sure to include them inside `index.js` before registering the root component.

#### 8. Build the project! 🚀

## API

This library provides first-class compatibility with the [Vercel AI SDK](https://sdk.vercel.ai/docs), allowing you to use familiar functions like `streamText` and `generateText` with locally run models.

### Key Functions

*   **`getModels(): Promise<AiModelSettings[]>`**
    Retrieves a list of available models configured in your `mlc-config.json`.

    ```typescript
    import { getModels } from 'react-native-ai';

    async function listModels() {
      const models = await getModels();
      console.log('Available models:', models);
    }
    ```

*   **`downloadModel(modelId: string, callbacks?: DownloadCallbacks): Promise<void>`**
    Downloads the specified model files. It accepts optional callbacks to track the download progress.

    ```typescript
    import { downloadModel, type DownloadProgress } from 'react-native-ai';

    await downloadModel('Mistral-7B-Instruct-v0.2-q3f16_1', {
      onStart: () => console.log('Download started...'),
      onProgress: (progress: DownloadProgress) => {
        console.log(`Downloading: ${progress.percentage.toFixed(2)}%`);
      },
      onComplete: () => console.log('Download complete!'),
      onError: (error: Error) => console.error('Download error:', error),
    });
    ```

*   **`prepareModel(modelId: string): Promise<void>`**
    Prepares the downloaded model for use by loading it into memory, if the model is not on the device it'll fetch it. However we recommend using `downloadModel` before calling `prepareModel`.

    ```typescript
    import { prepareModel } from 'react-native-ai';

    await prepareModel('Mistral-7B-Instruct-v0.2-q3f16_1');
    console.log('Model is ready!');
    ```

*   **`getModel(modelId: string): LanguageModelV1`**
    Returns a model instance compatible with the Vercel AI SDK (`LanguageModelV1` interface). You can pass this instance directly to Vercel AI SDK functions.

### Usage with Vercel AI SDK

Once a model is downloaded and prepared, you can use it with the Vercel AI SDK functions.

```typescript
import { getModel, prepareModel, downloadModel } from 'react-native-ai';
import { streamText, type CoreMessage } from 'ai';

async function runInference(modelId: string, messages: CoreMessage[]) {
  // Ensure model is downloaded and prepared first
  // await downloadModel(modelId, { /* callbacks */ }); // Optional: if not already downloaded
  await prepareModel(modelId);

  // Get the model instance compatible with Vercel AI SDK
  const llm = getModel(modelId);

  // Use the model with streamText
  const { textStream } = streamText({
    model: llm,
    messages: messages,
  });

  // Process the stream
  for await (const textPart of textStream) {
    console.log(textPart);
  }

  // You can also use generateText for non-streaming responses
  /*
  const { text } = await generateText({
    model: llm,
    prompt: 'Why is the sky blue?'
  });
  console.log(text);
  */
}

// Example usage:
const exampleMessages: CoreMessage[] = [
  { role: 'user', content: 'Hello! Tell me a short story.' },
];
runInference('Mistral-7B-Instruct-v0.2-q3f16_1', exampleMessages);
```

This setup allows you to leverage the power of the Vercel AI SDK's unified API while running models directly on the user's device.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
