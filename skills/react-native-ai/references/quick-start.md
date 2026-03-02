# Quick Start – React Native AI

## Quick Command

```bash
npm install
npm add ai @react-native-ai/<provider>
```

## When to Use

- First-time setup of any @react-native-ai provider
- Need to decide which provider fits the use case
- Write consumer code to use the model / provider

## Prerequisites

- [ ] React Native >= 0.76.0
- [ ] Vercel AI SDK v5+ (`ai` package) for generateText/streamText
- [ ] For Apple (Apple Intelligence) provider: iOS 26+, Apple Intelligence enabled

## Step-by-Step Instructions

### 1. Path Selection

Classify the request into exactly one path:

| Path    | Trigger terms                         | Reference file    |
| ------- | ------------------------------------- | ----------------- |
| Apple   | apple, Apple Intelligence, iOS 26     | apple-provider.md |
| Llama   | llama, GGUF, llama.rn, HuggingFace    | llama-provider.md |
| MLC-LLM | mlc, Llama-3.2, Phi, Qwen, download   | mlc-provider.md   |
| NCNN    | ncnn, loadModel, runInference, Tensor | ncnn-provider.md  |

### 2. Proceed to Provider

Open the reference file for the selected path and follow its checklist.

### 3. Consume the model

If using LLM providers (Apple, Llama, MLC-LLM), the user code uses the [Vercel AI SDK](https://ai-sdk.dev/docs/introduction) to run inference on the model in text streaming or generation mode.

If using NCNN, the user code supplies the input tensor and receives an output tensor.

## Common Pitfalls

- **Missing AI SDK**: Providers work with Vercel AI SDK; install `ai` for generateText/streamText.
- **Platform support**: Make sure the provider supports the current platform.
- **Expo**: The MLC-LLM package provides an Expo config plugin that needs to be added to `app.json`; Llama package needs the llama.rn plugin; this is described in reference files.

## Related Skills

- [apple-provider](apple-provider.md)
- [llama-provider](llama-provider.md)
- [mlc-provider](mlc-provider.md)
- [ncnn-provider](ncnn-provider.md)
