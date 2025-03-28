# react-native-ai

Run LLM locally in React Native app via Universal [MLC LLM Engine](https://github.com/mlc-ai/mlc-llm) with compatibility for [Vercel AI SDK](https://sdk.vercel.ai/docs/).

## Installation

1. Install the package

```
npm install react-native-ai
```

2. Clone MLC LLM Engine repository and follow the instructions to run `mlc_llm` CLI tool locally.

> [!IMPORTANT]
> Ensure that `mlc_llm` works and `MLC_LLM_SOURCE_DIR` is set in your environment variables.

3. Add `mlc-config.json` with models and other properties to root directory of your project:

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

4. [Android] If you want to execute models also on Android you need to set `ANDROID_NDK` and `TVM_NDK_CC` environment variables. Everything is described in [MLC LLM docs](https://llm.mlc.ai/docs/deploy/android.html#id2).

5.[iOS]

- Add "Increased Memory Limit" capability inside your Xcode project inside Signing & Capabilities tab.

- Install Cocoapods:
  ![Image](https://github.com/user-attachments/assets/0f8eec76-2900-48d9-91b8-ad7b3adce235)

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
