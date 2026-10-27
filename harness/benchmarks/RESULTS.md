# Runtime benchmark results: Qwen3 0.6B on iPhone 17 Pro

Measured on 2026-10-27, on one iPhone 17 Pro (iPhone18,1)
with iOS 27.0 (24A435), with the code in this folder. Raw results are in
[`results/qwen3-0.6b-iphone-17-pro.jsonl`](results/qwen3-0.6b-iphone-17-pro.jsonl),
and [README.md](README.md) explains how to reproduce them.

## Summary

- **Decode:** Core AI is as fast as MLX or faster, but only with a
  dynamic-shape export on the GPU (176 vs 166 tok/s on a short prompt, 136 vs
  108 tok/s at 1k tokens of context). The iOS export that Apple's recipe
  produces runs on the Neural Engine and decodes slower: 135 tok/s, and 77
  tok/s at 1k tokens.
- **Prefill:** the Neural Engine is the fastest at 6,453 tok/s on a
  1,003-token prompt, about 1.5 times MLX.
- **Startup:** the Neural Engine export is the slowest to start. The first
  launch spends about 100 s compiling the model, on the first prediction
  rather than at load. After that, every load still waits about 2.3 s for its
  first token.
- **Memory:** the Neural Engine export peaks at about 1.5–1.6 GB, against
  0.5–0.7 GB for MLX.

## Setup

| Runtime | Version | Model file | Quantization | Size | Compute | Context |
| --- | --- | --- | --- | --- | --- | --- |
| `core-ai` | `@react-native-ai/core-ai` on the Core AI stack (95e3f523), coreai-models 1.0.0 | `grabbou/qwen3-0.6b-CoreAI` `ios/` | mixed 4-bit and 8-bit palettization, static shapes | 440 MB | Neural Engine | 4,096 |
| `core-ai-gpu` | same | `mlboydaisuke/qwen3-0.6b-CoreAI-official` `macos/` | 4-bit, dynamic shapes | 336 MB | GPU | 8,192 |
| `mlx-swift` | mlx-swift-lm 3.32.3 (mlx-swift 0.32) | `mlx-community/Qwen3-0.6B-4bit` | 4-bit affine, group 64 | 335 MB | GPU | dynamic |
| `llama.rn` | `@react-native-ai/llama`, llama.rn 0.13.0-rc.8 | `bartowski/Qwen_Qwen3-0.6B-GGUF` Q4_0 | 4-bit, group 32 | 470 MB | GPU (Metal, all layers) | 4,096 |
| `executorch-mlx` | react-native-executorch 0.10.7 | model zoo `qwen_3_0_6b_mlx_int4.pte` | int4 weights | 628 MB | GPU (ExecuTorch MLX delegate) | 2,048 |
| `executorch-xnnpack` | same | model zoo `qwen_3_0_6b_xnnpack_8da4w.pte` | 8-bit dynamic activations, 4-bit weights | 506 MB | CPU (XNNPACK) | 2,048 |

Core AI picks the compute unit from the export's structure: static-shape
(chunked) language models go to the Neural Engine, and dynamic-shape ones to
the GPU. The GPU export is the one the same repository ships for macOS. It
loads and runs on iOS 27 as is.

## Methodology

- **Prompts:** two prompts from `prompts.ts`, 27 and 1,003 prompt tokens after
  Qwen3's chat template. Both ask for more than 256 tokens, so every run decodes
  the full 256 output tokens (ExecuTorch stops at 255).
- **Generation settings:** greedy decoding (temperature 0), thinking off, with
  the same template every runtime renders.
- **Runs:** each configuration runs in its own app launch. In that launch, each
  prompt gets 1 warmup run and then 3 measured runs, and the tables show the
  median of the 3. The warmup run is kept as "first run TTFT". Loads are
  measured 4 times: the first load in the process, then the median of 3 more.
- **What is timed:** TTFT runs from the call to the first token, including the
  chat template and tokenization. Prefill is prompt tokens over TTFT, so it
  includes the first decode step. Decode is the tokens after the first over the
  time from the first token to the last.
- **Memory:** the process footprint (`phys_footprint`, what jetsam limits,
  which includes Metal and Neural Engine buffers), sampled every 10 ms. Peak
  is over all 4 runs of a prompt.
- **Thermals:** each stage waits up to 5 minutes for the thermal state to
  return to `nominal`, then records the thermal state and Low Power Mode before
  and after its runs. Low Power Mode was off in every run.
- **App builds:** the React Native runtimes run in a debug build of the example
  app with native code compiled with optimization (`-O`, `-Os`), and JS from
  Metro. Core AI and llama.rn are called through the AI SDK's `streamText`.
  ExecuTorch's runner is called directly, because its chat session can't turn
  thinking off. MLX runs in a release build of a minimal Swift app.

### How many runs back each number

| Configuration | Launches with valid data | Measured runs per prompt | Thermal state | Status |
| --- | --- | --- | --- | --- |
| `mlx-swift` | 3 (decode 162, 163, 166 tok/s short; 107, 108, 108 at 1k) | 3 + 1 warmup per launch | nominal (recorded in the last launch) | final |
| `core-ai` | 1 at nominal, 1 at fair (119 / 76 tok/s) | 3 + 1 warmup | nominal | final, one clean launch |
| `core-ai-gpu` | 1 at nominal | 3 + 1 warmup | nominal | final, one clean launch |
| Core AI cold start | 2 launches (Neural Engine), 1 (GPU) | 1 per stage | – | final |
| `llama.rn` | 1 | 3 + 1 warmup | not recorded | preliminary: decode only |
| `executorch-mlx` | 1 | 3 + 1 warmup | not recorded | preliminary |
| `executorch-xnnpack` | 1 | 3 + 1 warmup | not recorded | preliminary |

The 3 measured runs within a launch are tight: within 3% of the median for
every final React Native configuration. Across launches, MLX varies by 2%. The preliminary
rows come from the first pass, which ran before the thermal tracking, the
per-configuration processes and the llama.rn prompt-cache fix existed:

- **llama.rn:** it reused the KV cache of the warmup run, so it prefilled 1
  token. Its prefill and TTFT are not valid, and only its decode speed is
  usable. The benchmark now clears the cache before every run.
- **ExecuTorch XNNPACK:** it ran in the same process after ExecuTorch MLX, so
  its memory numbers include the MLX run.
- **Rerun pending:** the rerun of these three didn't finish, because another
  session installed a different build on the shared test phone mid-pass.

A full pass without thermal waits throttled the phone to a third of these
speeds (MLX decoded at 62 tok/s), and those runs are not used.

## Results

### Generation, 27-token prompt

| Runtime | TTFT (ms) | First run TTFT (ms) | Prefill (tok/s) | Decode (tok/s) | Peak footprint (MB) |
| --- | --- | --- | --- | --- | --- |
| `core-ai-gpu` | 176 | 145 | 153 | **176.1** | 464 |
| `mlx-swift` | **31** | 85 | **858** | 165.7 | 499 |
| `core-ai` | 144 | 2,378 | 187 | 135.4 | 1,624 |
| `executorch-mlx` (preliminary) | 24 | – | 1,125 | 148.0 | 522 |
| `llama.rn` (preliminary) | – | – | – | 141.0 | 1,183 |
| `executorch-xnnpack` (preliminary) | 67 | – | 403 | 73.6 | 1,400 |

### Generation, 1,003-token prompt

| Runtime | TTFT (ms) | First run TTFT (ms) | Prefill (tok/s) | Decode (tok/s) | Peak footprint (MB) |
| --- | --- | --- | --- | --- | --- |
| `core-ai-gpu` | 226 | 329 | 4,441 | **135.6** | 1,287 |
| `mlx-swift` | 230 | 206 | 4,356 | 108.4 | 726 |
| `core-ai` | **155** | 285 | **6,453** | 77.2 | 1,488 |
| `executorch-mlx` (preliminary) | 250 | – | 4,012 | 116.9 | 715 |
| `llama.rn` (preliminary) | – | – | – | 114.2 | 1,188 |
| `executorch-xnnpack` (preliminary) | 2,550 | – | 393 | 27.9 | 1,463 |

### Loading

| Runtime | First load in a process (ms) | Warm load (ms) | First token after a load (ms) |
| --- | --- | --- | --- |
| `core-ai` | 327 | 344 | 2,298 |
| `core-ai-gpu` | 365 | 326 | 124 |
| `mlx-swift` | 362 | 277 | 85 |
| `llama.rn` (preliminary) | 414 | 142 | – |
| `executorch-mlx` (preliminary) | 635 | 186 | – |
| `executorch-xnnpack` (preliminary) | 477 | 429 | – |

### Core AI cold start

The first launch after installing a model, with Core AI's specialization cache
(`Library/Caches/coreai-cache`) cleared:

| Export | Load (ms) | First token (ms) | `specialize()` (ms) | Load after it (ms) | First token after it (ms) |
| --- | --- | --- | --- | --- | --- |
| `core-ai` (Neural Engine) | 325 | 102,434 | 0.3 | 372 | 110,889 |
| `core-ai-gpu` | 356 | 2,051 | 1 | 338 | 1,500 |

A second launch measured the Neural Engine export's cold first token at
103,206 ms, and 120,353 ms after `specialize()`.

## Is Core AI as fast as MLX?

**Decode on the GPU: yes, and a little faster.** With a dynamic-shape 4-bit
export the same size as MLX's, Core AI decodes 6% faster on a short prompt
and 25% faster at 1k tokens of context. MLX slows down more as the context
grows (166 → 108 tok/s) than Core AI's GPU path does (176 → 136 tok/s).

**Prefill on the Neural Engine: fastest of all.** The Neural Engine prefills
a 1,003-token prompt at 6,453 tok/s, against about 4,400 tok/s for the GPU
runtimes, so long prompts get the first token sooner.

**Decode on the Neural Engine: no.** It decodes at 135 tok/s on a short prompt
and 77 tok/s at 1k tokens, 18–29% behind MLX. The reasons:

- **One token at a time:** decoding processes a single token per step, a
  workload GPUs handle well and the Neural Engine is not built for. Prefill is
  the opposite: many tokens per step, where the Neural Engine excels.
- **Fixed shapes:** the static export is compiled for fixed shapes and
  attends over the full 4,096-token KV buffer. Its decode cost depends on that
  buffer, not on the tokens actually used. That doesn't explain the drop from
  135 to 77 tok/s at 1k tokens, though, which points to the chunked
  static-shape engine itself.
- **Heavier weights:** the iOS export keeps some layers at 8 bits (440 MB of
  weights against 336 MB for the 4-bit GPU export), so each decode step reads
  more weight data.

**Startup and memory favor MLX and the GPU export.** The Neural Engine
export:

- compiles on its first prediction, about 100 s on a first launch;
- waits 2.3 s for the first token after every load, even with the compile
  cached;
- peaks at 3× the footprint of MLX or the GPU export on a short prompt.

`specialize()` takes under 1 ms and doesn't move the compile out of the first
generation, so it can't be used to warm the model up ahead of time.

**Other runtimes (preliminary):**
- **ExecuTorch with its MLX backend** is close to mlx-swift: 148 vs 166
  tok/s, and 117 vs 108 at 1k tokens.
- **llama.rn** decodes at 141 tok/s, and 114 at 1k tokens.
- **XNNPACK on the CPU** is the slowest by far.

The JS-side timing through the AI SDK and a dev-mode bundle may cost the
React Native runtimes a little against the native MLX app. Core AI's GPU
export still came out ahead of MLX with that cost included.

## Follow-ups

- Rerun `llama.rn`, `executorch-mlx` and `executorch-xnnpack` with the fixed
  benchmarks, and repeat both Core AI exports at least twice more, so every
  configuration has 3 clean launches.
- Try Qwen3 4B (`mlboydaisuke/qwen3-4b-CoreAI-official` has both iOS and macOS
  exports), where memory bandwidth matters more than for a 0.6B model.
- Check whether Apple's recipe can export dynamic shapes for iOS, since that
  export is the fastest Core AI configuration here.
