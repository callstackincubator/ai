# React Native AI - Example App

This example app demonstrates both Apple Intelligence and MLC on-device AI capabilities.

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

## Features

- Apple Intelligence (iOS 17+): Text generation, embeddings, transcription, speech synthesis
- MLC Models: Run Llama, Phi, Mistral, and Qwen models on-device
- Tool calling and structured output support
- Streaming text generation

## Troubleshooting

> [!WARNING]
> If you encounter runtime errors related to MLC:
> 1. Ensure you've built the runtime binaries (see above)
> 2. Run `npx expo prebuild --clean` if you've made configuration changes
> 3. Check that your device has sufficient memory for the model you're using (1-8GB)
