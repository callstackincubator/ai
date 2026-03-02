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

1. Select **Apple** if prompt mentions:
   - `apple`, `Apple Intelligence`, `Apple Foundation Models`
   - `transcription`, `speech synthesis`, `embeddings` on Apple devices
   - `createAppleProvider`, `tool calling` with Apple Intelligence
2. Select **Llama** if prompt mentions:
   - `llama`, `GGUF`, `llama.rn`, `HuggingFace`, `downloadModel`, `SmolLM`
   - `embedding model`, `rerank`, `speech model` with GGUF
3. Select **MLC** if prompt mentions:
   - `mlc`, `MLC`, `Llama-3.2`, `Phi`, `Qwen`, `model.download()`
   - `increased memory limit`, `physical device` for iOS
4. Select **NCNN** if prompt mentions:
   - `ncnn`, `NCNN`, `loadModel`, `runInference`, `Tensor`
   - custom models such as convolutional networks, multi-layer perceptrons, low-level inference, etc.
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

| Priority | Category                    | Impact   | Start File                       |
| -------- | --------------------------- | -------- | -------------------------------- |
| 1        | Path selection and baseline | CRITICAL | [quick-start][quick-start]       |
| 2        | Apple provider              | CRITICAL | [apple-provider][apple-provider] |
| 3        | Llama provider              | CRITICAL | [llama-provider][llama-provider] |
| 4        | MLC-LLM provider            | CRITICAL | [mlc-provider][mlc-provider]     |
| 5        | NCNN provider               | HIGH     | [ncnn-provider][ncnn-provider]   |

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

| File                             | Impact   | Description                                |
| -------------------------------- | -------- | ------------------------------------------ |
| [quick-start][quick-start]       | CRITICAL | Shared preflight                           |
| [apple-provider][apple-provider] | CRITICAL | Apple Intelligence setup and integration   |
| [llama-provider][llama-provider] | CRITICAL | GGUF models, llama.rn, model management    |
| [mlc-provider][mlc-provider]     | CRITICAL | MLC models, download, prepare, Expo plugin |
| [ncnn-provider][ncnn-provider]   | HIGH     | NCNN wrapper, loadModel, runInference      |

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
