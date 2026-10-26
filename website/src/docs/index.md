# Introduction

A collection of on-device AI primitives for React Native with first-class Vercel AI SDK support. Run AI models directly on users' devices for privacy-preserving, low-latency inference without server costs.

## Why On-Device AI?

- **Privacy-first:** Inference runs locally, so data stays on the device. Cloud models are opt-in
- **Instant responses:** No network latency, immediate AI capabilities
- **Offline-ready:** Works anywhere, even without internet
- **Zero server costs:** No API fees or infrastructure to maintain

## DevTools

The AI SDK Profiler plugin captures OpenTelemetry spans from Vercel AI SDK
requests and surfaces them in Rozenite DevTools. DevTools are runtime
agnostic, so they work with on-device and remote runtimes.

Learn more in the [DevTools documentation](./dev-tools).

## Available Providers

### Built-in Models

These use models that ship with the operating system. There's nothing to download, so they work immediately on supported devices.

#### Apple Intelligence

Native integration with Apple's on-device AI capabilities through `@react-native-ai/apple`:

- **Text Generation** - Apple Foundation Models for chat and completion
- **Embeddings** - NLContextualEmbedding for semantic search and similarity
- **Transcription** - SpeechAnalyzer for fast, accurate speech-to-text
- **Speech Synthesis** - AVSpeechSynthesizer for natural text-to-speech

No model downloads. Works on supported iOS devices out of the box.

#### Google Gemini

Native integration with Gemini on Android through `@react-native-ai/adk`, built on Google's Agent Development Kit:

- **On-device** - Gemini Nano, provisioned by the system via AICore
- **Cloud** - Larger Gemini models through the Google AI API, when you need them
- **Tool Calling** - ADK agent loop with JavaScript tool executors
- **Streaming** - Text and tool-call stream parts

No model downloads or API key for on-device use. Works on supported Android devices out of the box. See the [ADK docs](./adk/getting-started).

### Bring Your Own Model

These run open-source models that you download or bundle with your app.

#### Llama Engine

Run any GGUF model from HuggingFace locally using `llama.rn` through `@react-native-ai/llama`:

- **Text Generation** - High-performance GGUF inference with full streaming support
- **Model Management** - Automatic downloading and caching from HuggingFace
- **Customizable** - Support for context size, threads, and GGUF-specific parameters

Works on iOS and Android.

## JSON UI

Build UIs from tool-calling models with `@react-native-ai/json-ui`:

- **Tool-based spec** - Model calls tools to add/set/delete nodes and props
- **GenerativeUIView** - Renders the spec in React Native; override styles or supply a custom node renderer
- **Small-model friendly** - Designed for on-device models with limited context

See the [JSON UI docs](./json-ui/getting-started) for setup and API.
