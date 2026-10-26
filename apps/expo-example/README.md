# React Native AI - Example App

This example app demonstrates Apple Intelligence, Google ADK, and Llama on-device AI capabilities.

## Prerequisites

### ADK (Android)

Google ADK local models are available on Android in the model picker:

- **ADK Gemini Flash** — cloud Gemini via ADK (requires API key)
- **ADK Gemini Nano** — on-device via ML Kit GenAI

Create `.env` from the example and add your key:

```bash
cp .env.example .env
```

Set `EXPO_PUBLIC_GOOGLE_API_KEY` from [Google AI Studio](https://aistudio.google.com/app/apikey).

ADK requires Android `minSdkVersion` 26 or greater (ML Kit GenAI). This example sets it via `expo-build-properties` in `app.json`. After changing native config, run:

```bash
npx expo prebuild --clean
```

### Core AI (iOS 27 devices)

Core AI is opt-in, because it raises the deployment target to iOS 27 and can't build for the Simulator. Set `CORE_AI=1` when you prebuild to link `@react-native-ai/core-ai` and its config plugin:

```bash
CORE_AI=1 npx expo prebuild --clean --platform ios
```

Run `npx expo prebuild --clean` without it to go back to the default build.

The model picker then lists **Core AI qwen3-0.6b**, which downloads (~460 MB) from [an iOS export](https://huggingface.co/grabbou/qwen3-0.6b-CoreAI) made with the [`apple/coreai-models`](https://github.com/apple/coreai-models) recipe.

The tests in [`harness/core-ai`](../../harness/core-ai) are part of the [device tests](#on-device-tests). They download Qwen3 0.6B and the [YOLOS-tiny](https://huggingface.co/grabbou/yolos-tiny-CoreAI) and [EfficientSAM-Ti](https://huggingface.co/grabbou/EfficientSAM-Ti-CoreAI) exports on the first run.

### Private Cloud Compute (iOS 27 devices)

Private Cloud Compute needs Apple's managed `com.apple.developer.private-cloud-compute` entitlement on the signing team, and the app crashes without it. Set `PCC=1` when you prebuild to add the entitlement and the `AppleLLMPrivateCloudCompute` Info.plist key:

```bash
PCC=1 npx expo prebuild --clean --platform ios
```

The tests in [`harness/apple/pcc.device.harness.ts`](../../harness/apple/pcc.device.harness.ts) are part of the [device tests](#on-device-tests), and fail if Private Cloud Compute is not available.

## Running the App

Run:

**iOS:**

```bash
bun run ios
```

**Android:**

```bash
bun run android
```

## On-device Tests

The providers are tested with [React Native Harness](https://react-native-harness.dev), which runs the tests in [`harness/`](../../harness) at the repository root inside this app, against the real native modules and models. Each provider has a folder with one file per feature. Files ending in `.device.harness.ts` need a physical device.

Each command builds the app with the right flags, installs it, and runs the tests in it. Run the tests that don't need a physical device on an iPhone 18 Pro simulator with iOS 27:

```bash
bun run test:harness:simulator
```

Or run every test, including [Core AI](#core-ai-ios-27-devices) and [Private Cloud Compute](#private-cloud-compute-ios-27-devices), on a physical device with Apple Intelligence, named as `xcrun devicectl list devices` shows it. The device build sets `CORE_AI=1 PCC=1`, so the team signing it needs the Private Cloud Compute entitlement, or those tests fail. Devices always connect to Metro on port 8081, so stop any Metro server running there first:

```bash
HARNESS_IOS_DEVICE="My iPhone" bun run test:harness:device
```

Both regenerate the `ios` folder, so run `npx expo prebuild --clean` afterwards to go back to the default build.

Pass a path such as `harness/apple` or `harness/apple/tools` to run part of the tests. The first llama run downloads about 2.5 GB of models.

## Rozenite DevTools

The native example app includes Rozenite wiring for
`@react-native-ai/dev-tools`, so AI SDK chat requests can be inspected in the
`AI SDK Profiler` panel during development.

This setup is native-dev-only. The dev-tools package intentionally falls back to
no-op behavior on web and in production builds.

### Setup

From the repository root, install workspace dependencies:

```bash
bun install
```

Then start the example app Metro server from this directory:

```bash
bun run start
```

Run the app on iOS or Android using the commands above, then open React Native
DevTools and switch to the Rozenite view. You should see an `AI SDK Profiler`
panel provided by `@react-native-ai/dev-tools`.

If the panel appears but stays empty after sending a message, close that React
Native DevTools window and open a new one. A stale debugger session can keep
the panel visible while missing the active app connection.

### Verify Telemetry

1. Start the native app in development mode.
2. Open the chat screen.
3. Send a message.
4. Open `AI SDK Profiler` in Rozenite.

After the message is sent, the profiler should show spans for the
`streamText(...)` request with the function identifier
`chat-screen-stream-text`.

## Features

- Apple Intelligence (iOS 17+): Text generation, embeddings, transcription, speech synthesis
- Google ADK (Android): Cloud Gemini and on-device Gemini Nano model with tool calling
- Tool calling and structured output support
- Streaming text generation
