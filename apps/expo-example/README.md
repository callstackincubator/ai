# React Native AI - Example App

This example app demonstrates Apple Intelligence, Google ADK, and MLC on-device AI capabilities.

## Prerequisites

> [!IMPORTANT]
> Before running this app, you need to build the MLC runtime binaries.

### Build MLC Runtime

Navigate to the MLC package and run the build command for your target platform:

**For iOS:**

```bash
cd ../../packages/mlc
bun run build:runtime:ios
```

**For Android:**

```bash
cd ../../packages/mlc
bun run build:runtime:android
```

> [!NOTE]
> The build process requires additional setup. Run `./scripts/build-runtime.sh --help` in the MLC package directory to see detailed prerequisites for your platform.

### ADK (Android)

Google ADK agents are available on Android in the model picker:

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

## Running the App

After building the MLC runtime, navigate back to this directory and run:

**iOS:**

```bash
bun run ios
```

**Android:**

```bash
bun run android
```

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
- Google ADK (Android): Cloud Gemini and on-device Gemini Nano agents with tool calling
- MLC Models: Run Llama, Phi, Mistral, and Qwen models on-device
- Tool calling and structured output support
- Streaming text generation

## Troubleshooting

> [!WARNING]
> If you encounter runtime errors related to MLC:
>
> 1. Ensure you've built the runtime binaries (see above)
> 2. Run `npx expo prebuild --clean` if you've made configuration changes
> 3. Check that your device has sufficient memory for the model you're using (1-8GB)
