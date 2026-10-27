---
name: react-native-ai-skills
description: Provides integration recipes for the React Native AI @react-native-ai packages that wrap the Llama.rn (Llama.cpp), Apple Foundation and Apple Core AI backends. Use when integrating local on-device AI in React Native, setting up providers, model management.
license: MIT
metadata:
  author: Callstack
  tags: react-native, ai, llama, apple, core-ai, ncnn, vercel-ai-sdk, on-device
---

# React Native AI Skills

## Overview

Example workflow for integrating on-device AI in React Native apps using the @react-native-ai ecosystem. Available provider tracks (can be combined):

- **Apple** – Apple Intelligence (iOS 26+)
- **Core AI** – Apple Core AI model bundles exported with coreai-models (iOS 27+)
- **Llama** – GGUF models via llama.rn
- **NCNN** – Low-level NCNN inference wrapper (vision, custom models)

## Path Selection Gate (Must Run First)

Before selecting any reference file, classify the user request:

An explicit provider, model or bundle (for example Core AI, Parakeet or an `.aimodel`) takes precedence over a generic feature match.

1. Select **Apple**:
   - if you intend to build with: `apple`, `Apple Intelligence`, `Apple Foundation Models`
   - if you want features: `transcription`, `speech synthesis`, `embeddings` on Apple devices
   - optionally with capabilities: tool calling
2. Select **Core AI**:
   - if you intend to use: `Core AI`, `coreai-models`, `.aimodel` bundles
   - if you want features on iOS 27 with your own models: image generation, transcription with Parakeet, CLIP embeddings, object detection, segmentation, video tracking, super-resolution, classification, depth estimation
   - if you want video generation with Wan 2.1 on macOS 27 (it does not fit in iPhone memory yet)
3. Select **Llama**:
   - if you intend to use the following technologies: `llama`, `GGUF`, `llama.rn`, `HuggingFace`, `Qwen`
   - if you want to perform the following operations: `embedding model`, `rerank`, `speech model`
4. Select **NCNN**:
   - if you need to use run low-level inference on bare metal tensors
   - if you intend to run inference of custom models such as convolutional networks, multi-layer perceptrons, low-level inference, etc.
   - DO NOT select NCNN if the prompt mentions LLMs only, this use case is better solved by other providers

## Skill Format

Each reference file follows a strict execution format:

- Quick Command
- When to Use
- Prerequisites
- Step-by-Step Instructions
- Common Pitfalls
- Related Skills

Use the checklists exactly as written before moving to the next phase.

## When to Apply

Reference this package when:

- Integrating on-device AI in React Native apps
- Installing and configuring @react-native-ai providers
- Managing model downloads (llama)
- Wiring providers with Vercel AI SDK (generateText, streamText)
- Implementing SetupAdapter pattern for multi-provider apps
- Debugging native module or Expo plugin issues

## Priority-Ordered Guidelines

| Priority | Category                    | Impact | Start File                           |
| -------- | --------------------------- | ------ | ------------------------------------ |
| 1        | Path selection and baseline | N/A    | [quick-start][quick-start]           |
| 2        | Apple provider              | N/A    | [apple-provider][apple-provider]     |
| 3        | Core AI provider            | N/A    | [core-ai-provider][core-ai-provider] |
| 4        | Llama provider              | N/A    | [llama-provider][llama-provider]     |
| 5        | NCNN provider               | N/A    | [ncnn-provider][ncnn-provider]       |

## Quick Reference

```bash
npm install

# Provider-specific install
npm add @react-native-ai/apple
npm add @react-native-ai/core-ai @react-native-ai/apple
npm add @react-native-ai/llama llama.rn
npm add @react-native-ai/ncnn-wrapper
```

Route by path:

- Apple: [apple-provider][apple-provider]
- Core AI: [core-ai-provider][core-ai-provider]
- Llama: [llama-provider][llama-provider]
- NCNN: [ncnn-provider][ncnn-provider]

## References

| File                                 | Impact | Description                              |
| ------------------------------------ | ------ | ---------------------------------------- |
| [quick-start][quick-start]           | N/A    | Shared preflight                         |
| [apple-provider][apple-provider]     | N/A    | Apple Intelligence setup and integration |
| [core-ai-provider][core-ai-provider] | N/A    | Core AI bundles, tasks, hosted models    |
| [llama-provider][llama-provider]     | N/A    | GGUF models, llama.rn, model management  |
| [ncnn-provider][ncnn-provider]       | N/A    | NCNN wrapper, loadModel, runInference    |

## Problem → Skill Mapping

| Problem                              | Start With                                     |
| ------------------------------------ | ---------------------------------------------- |
| Need path decision first             | [quick-start][quick-start]                     |
| Integrate Apple Intelligence         | [apple-provider][apple-provider]               |
| Run Core AI models on iOS 27         | [core-ai-provider][core-ai-provider]           |
| Run GGUF models from HuggingFace     | [llama-provider][llama-provider]               |
| Use NCNN for custom inference        | [ncnn-provider][ncnn-provider]                 |
| Multi-provider app with SetupAdapter | [quick-start][quick-start] → provider-specific |
| Expo + native module setup           | Provider-specific (each has Expo notes)        |

[quick-start]: references/quick-start.md
[apple-provider]: references/apple-provider.md
[core-ai-provider]: references/core-ai-provider.md
[llama-provider]: references/llama-provider.md
[ncnn-provider]: references/ncnn-provider.md
