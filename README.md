# react-native-ai

Run LLMs locally in React Native app via Universal [MLC LLM Engine](https://github.com/mlc-ai/mlc-llm) with compatibility for [Vercel AI SDK](https://sdk.vercel.ai/docs/).

## Installation

1. Install the package

```
npm install react-native-ai
```

2. Clone MLC LLM Engine repository and set environment variable.

```
git clone https://github.com/mlc-ai/mlc-llm
cd mlc-llm
git submodule update --init --recursive
MLC_LLM_SOURCE_DIR=$(pwd) // Add this to your environment variables e.g. in .zshrc
```

> [!IMPORTANT]
> Ensure that `mlc_llm` works and `MLC_LLM_SOURCE_DIR` is set in your environment variables.

3. Install `mlc_llm` CLI:

To install `mlc_llm` CLI, please follow steps described [in the official guide](https://llm.mlc.ai/docs/install/mlc_llm.html).

To ensure that CLI is installed correctly, run the following command:

```
mlc_llm
```

If you see any output then it means that CLI is installed correctly.

4. Add `mlc-config.json` with models and other properties to root directory of your project:

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

4. **[Android only]** If you want to execute models also on Android you need to set `ANDROID_NDK` and `TVM_NDK_CC` environment variables. Everything is described in [MLC LLM docs](https://llm.mlc.ai/docs/deploy/android.html#id2).

5. **[iOS only]** If you want to execute models also on iOS you need to:

- Add "Increased Memory Limit" capability inside your Xcode project inside Signing & Capabilities tab.
  ![Image](https://github.com/user-attachments/assets/0f8eec76-2900-48d9-91b8-ad7b3adce235)
- Install Cocoapods:
  ```
  cd ios && pod install
  ```

6. Run the following command to prepare binaries and static libraries for the project

```
npm run react-native-ai mlc-prepare
```

7. Build the project! 🚀

## API

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
