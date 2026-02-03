# Introduction

A collection of on-device AI primitives for React Native with first-class Vercel AI SDK support. Run AI models directly on users' devices for privacy-preserving, low-latency inference without server costs.

## Why On-Device AI?

- **Privacy-first:** All processing happens locally—no data leaves the device
- **Instant responses:** No network latency, immediate AI capabilities  
- **Offline-ready:** Works anywhere, even without internet
- **Zero server costs:** No API fees or infrastructure to maintain

## DevTools

The AI SDK Profiler plugin captures OpenTelemetry spans from Vercel AI SDK
requests and surfaces them in Rozenite DevTools. DevTools are runtime
agnostic, so they work with on-device and remote runtimes.

Learn more in the [DevTools documentation](./dev-tools).

## Available Providers

### Apple Intelligence

Native integration with Apple's on-device AI capabilities through `@react-native-ai/apple`:

- **Text Generation** - Apple Foundation Models for chat and completion
- **Embeddings** - NLContextualEmbedding for semantic search and similarity
- **Transcription** - SpeechAnalyzer for fast, accurate speech-to-text
- **Speech Synthesis** - AVSpeechSynthesizer for natural text-to-speech

Production-ready with instant availability on supported iOS devices.

### Llama Engine

Run any GGUF model from HuggingFace locally using `llama.rn` through `@react-native-ai/llama`:

- **Text Generation** - High-performance GGUF inference with full streaming support
- **Model Management** - Automatic downloading and caching from HuggingFace
- **Customizable** - Support for context size, threads, and GGUF-specific parameters

Cross-platform parity with optimized performance on both iOS and Android.

### MLC Engine (Work in Progress)

Run any open-source LLM locally using MLC's optimized runtime through `@react-native-ai/mlc`:

- Support for popular models like Llama, Mistral, and Phi
- Cross-platform compatibility (iOS and Android)

> [!NOTE]
> MLC support is experimental and not recommended for production use yet.

### Google (Coming Soon)

Support for Google's on-device models is planned for future releases.

Get started by choosing the approach that fits your needs!
