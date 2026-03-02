---
name: react-native-ai-skills
description: Provides integration recipes for the React Native AI @react-native-ai packages that wrap the Llama.rn (Llama.cpp), MLC-LLM, Apple Foundation backends. Use when integrating local on-device AI in React Native, setting up providers, model management.
license: MIT
metadata:
  author: Callstack
  tags: react-native, ai, llama, apple, mlc, ncnn, vercel-ai-sdk, on-device
---

# React Native AI Skills

## Overview

Example workflow for integrating on-device AI in React Native apps using the @react-native-ai ecosystem. Available provider tracks (can be combined):

- **Apple** – Apple Intelligence (iOS 26+)
- **Llama** – GGUF models via llama.rn
- **MLC** – MLC-LLM models
- **NCNN** – Low-level NCNN inference wrapper (vision, custom models)

## Path Selection Gate (Must Run First)

Before selecting any reference file, classify the user request:

1. Select **Apple**:
   - if you intend to build with: `apple`, `Apple Intelligence`, `Apple Foundation Models`
   - if you want features: `transcription`, `speech synthesis`, `embeddings` on Apple devices
   - optionally with capabilities: tool calling
2. Select **Llama**:
   - if you intend to use the following technologies: `llama`, `GGUF`, `llama.rn`, `HuggingFace`, `SmolLM`
   - if you want to perform the following operations: `embedding model`, `rerank`, `speech model`
3. Select **MLC**:
   - if you intend to use a library that allows for custom models and involves build-time model optimizations
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
- Managing model downloads (llama, mlc)
- Wiring providers with Vercel AI SDK (generateText, streamText)
- Implementing SetupAdapter pattern for multi-provider apps
- Debugging native module or Expo plugin issues

## Priority-Ordered Guidelines

| Priority | Category                    | Impact | Start File                       |
| -------- | --------------------------- | ------ | -------------------------------- |
| 1        | Path selection and baseline | N/A    | [quick-start][quick-start]       |
| 2        | Apple provider              | N/A    | [apple-provider][apple-provider] |
| 3        | Llama provider              | N/A    | [llama-provider][llama-provider] |
| 4        | MLC-LLM provider            | N/A    | [mlc-provider][mlc-provider]     |
| 5        | NCNN provider               | N/A    | [ncnn-provider][ncnn-provider]   |

## Quick Reference

```bash
npm install

# Provider-specific install
npm add @react-native-ai/apple
npm add @react-native-ai/llama llama.rn
npm add @react-native-ai/mlc
npm add @react-native-ai/ncnn-wrapper
```

Route by path:

- Apple: [apple-provider][apple-provider]
- Llama: [llama-provider][llama-provider]
- MLC: [mlc-provider][mlc-provider]
- NCNN: [ncnn-provider][ncnn-provider]

## References

| File                             | Impact | Description                                |
| -------------------------------- | ------ | ------------------------------------------ |
| [quick-start][quick-start]       | N/A    | Shared preflight                           |
| [apple-provider][apple-provider] | N/A    | Apple Intelligence setup and integration   |
| [llama-provider][llama-provider] | N/A    | GGUF models, llama.rn, model management    |
| [mlc-provider][mlc-provider]     | N/A    | MLC models, download, prepare, Expo plugin |
| [ncnn-provider][ncnn-provider]   | N/A    | NCNN wrapper, loadModel, runInference      |

## Problem → Skill Mapping

| Problem                               | Start With                                     |
| ------------------------------------- | ---------------------------------------------- |
| Need path decision first              | [quick-start][quick-start]                     |
| Integrate Apple Intelligence          | [apple-provider][apple-provider]               |
| Run GGUF models from HuggingFace      | [llama-provider][llama-provider]               |
| Run MLC-LLM models (Llama, Phi, Qwen) | [mlc-provider][mlc-provider]                   |
| Use NCNN for custom inference         | [ncnn-provider][ncnn-provider]                 |
| Multi-provider app with SetupAdapter  | [quick-start][quick-start] → provider-specific |
| Expo + native module setup            | Provider-specific (each has Expo notes)        |

[quick-start]: references/quick-start.md
[apple-provider]: references/apple-provider.md
[llama-provider]: references/llama-provider.md
[mlc-provider]: references/mlc-provider.md
[ncnn-provider]: references/ncnn-provider.md
