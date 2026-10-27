# Runtime benchmark results: Qwen3 0.6B on iPhone 17 Pro

Measured on 2026-10-27, on one iPhone 17 Pro (iPhone18,1) with iOS 27.0
(24A435), with the code in this folder. Raw results, one line per launch and
stage, are in
[`results/qwen3-0.6b-iphone-17-pro.jsonl`](results/qwen3-0.6b-iphone-17-pro.jsonl).
`bun harness/benchmarks/collect.ts harness/benchmarks/results/*.jsonl`
rebuilds every table below, and [README.md](README.md) explains how to rerun
them.

## Summary

- **Decode:** Core AI is as fast as MLX or faster, but only with a
  dynamic-shape export on the GPU: 176 vs 163 tok/s (+8%) on a short prompt,
  and 135 vs 108 tok/s (+26%) at 1k tokens of context.
- **The iOS export:** Apple's recipe exports Qwen3 for iOS with static shapes,
  and Core AI runs it on the Neural Engine. It decodes 16% slower than MLX on
  a short prompt and 28% slower at 1k tokens.
- **Prefill:** the Neural Engine is the fastest: 6,531 tok/s on a 1,003-token
  prompt, 1.35 times MLX.
- **Startup:** the Neural Engine export is the slowest to start. The first
  launch spends about 103 s compiling the model, on the first prediction
  rather than at load. After that, every load still waits about 2.6 s for its
  first token. The GPU export needs 2 s on the first launch and 0.12 s after.
- **Memory:** the Neural Engine export uses the most memory: 1.3–1.4 GB above
  the app's baseline, against 0.5–0.7 GB for MLX.
- **Other React Native runtimes:** ExecuTorch with its MLX backend comes close
  to mlx-swift (150 / 120 tok/s). llama.rn decodes at 137 / 112 tok/s, and
  ExecuTorch's XNNPACK on the CPU at 83 / 42 tok/s.

## Setup

| Runtime | Version | Model file | Quantization | Size | Compute | Context |
| --- | --- | --- | --- | --- | --- | --- |
| `core-ai` | `@react-native-ai/core-ai` (main), coreai-models 1.0.0 | `grabbou/qwen3-0.6b-CoreAI` `ios/` | mixed 4-bit and 8-bit palettization, static shapes | 440 MB | Neural Engine | 4,096 |
| `core-ai-gpu` | same | `mlboydaisuke/qwen3-0.6b-CoreAI-official` `macos/` | 4-bit, dynamic shapes | 336 MB | GPU | 8,192 |
| `mlx-swift` | mlx-swift-lm 3.32.3 (mlx-swift 0.32) | `mlx-community/Qwen3-0.6B-4bit` | 4-bit affine, group 64 | 335 MB | GPU | dynamic |
| `llama.rn` | `@react-native-ai/llama`, llama.rn 0.13.0-rc.8 | `bartowski/Qwen_Qwen3-0.6B-GGUF` Q4_0 | 4-bit, group 32 | 470 MB | GPU (Metal, all layers) | 4,096 |
| `executorch-mlx` | react-native-executorch 0.10.7 | model zoo `qwen_3_0_6b_mlx_int4.pte` | int4 weights | 628 MB | GPU (ExecuTorch MLX delegate) | 2,048 |
| `executorch-xnnpack` | same | model zoo `qwen_3_0_6b_xnnpack_8da4w.pte` | 8-bit dynamic activations, 4-bit weights | 506 MB | CPU (XNNPACK) | 2,048 |

Core AI picks the compute unit from the export's structure: static-shape
(chunked) language models go to the Neural Engine, and dynamic-shape ones to
the GPU. The GPU export is the one the same repository ships for macOS. It
loads and runs on iOS 27 as is.

The first Core AI launch ran on the Core AI stack (95e3f523). The rest ran on
`main` (72cdfc9e), after the stack merged, with the same native code.

## Methodology

**Generation:**
- **Prompts:** two prompts from `prompts.ts`, 27 and 1,003 prompt tokens after
  Qwen3's chat template. Both ask for more than 256 tokens, so every run decodes
  all 256 output tokens (ExecuTorch stops at 255).
- **Settings:** greedy decoding (temperature 0), thinking off, with the same
  chat template for every runtime.
- **Runs per launch:** each configuration runs in its own app launch. In that
  launch, each prompt gets 1 warmup run and then 3 measured runs, and each
  launch reports the median of its 3. The warmup run is kept as "first run
  TTFT". Loads are measured 4 times: the first load in the process, then the
  median of 3 more.
- **Several launches:** where a configuration has several launches, the
  tables show the median of the launch medians, with the range of decode
  speeds in parentheses.

**Timing:**
- **TTFT** runs from the call to the first token, including the chat template
  and tokenization.
- **Prefill** is prompt tokens over TTFT, so it includes the first decode
  step.
- **Decode** is the tokens after the first over the time from the first token
  to the last.

**Memory:**
- **What is measured:** the process footprint (`phys_footprint`, what jetsam
  limits, which includes Metal and Neural Engine buffers), sampled every
  10 ms. The peak covers all 4 runs of a prompt.
- **Comparing apps:** the example app takes about 200 MB before a model loads,
  while the bare MLX app takes 10 MB. The tables also show the peak above that
  baseline, which is what the model costs.

**Thermal state:**
- **Before each stage:** the stage waits up to 5 minutes for the thermal
  state to return to `nominal`, and records the thermal state and Low Power
  Mode before and after its runs. Low Power Mode was off in every run.
- **Throttled launches:** launches that started or ended in any other state
  are left out of the main tables and listed under
  [throttled launches](#throttled-launches).
- **Discarded pass:** an early full pass, before these waits existed, ran at a
  third of these speeds and is not used.

**App builds:**
- **React Native runtimes:** they run in a debug build of the example app,
  with native code compiled with optimization (`-O`, `-Os`) and JS from Metro.
  Core AI and llama.rn are called through the AI SDK's `streamText`.
  ExecuTorch's runner is called directly, because its chat session can't turn
  thinking off.
- **MLX:** it runs in a release build of a minimal Swift app.

### Runs behind each number

| Configuration | Launches in the tables | Throttled launches left out | Measured runs per prompt and launch |
| --- | --- | --- | --- |
| `mlx-swift` | 3 | 0 | 3 (+1 warmup) |
| `core-ai` | 2 | 1 (serious) | 3 (+1 warmup) |
| `core-ai-gpu` | 2 | 1 (serious) | 3 (+1 warmup) |
| `llama.rn` | 1 | 1 (fair) | 3 (+1 warmup) |
| `executorch-mlx` | 1 | 1 (fair, then serious) | 3 (+1 warmup) |
| `executorch-xnnpack` | 1 | 1 (fair) | 3 (+1 warmup) |
| Core AI cold start | 2 (Neural Engine), 1 (GPU) | – | 1 per stage |

- **Within a launch:** the 3 measured runs are within 3% of the launch median
  (4% for XNNPACK on the CPU).
- **Across nominal launches:** the decode speed varies by up to 1.6% for Core
  AI and 2% for MLX.
- **Not recorded:** two of the three MLX launches ran before thermal tracking
  existed. They match the recorded launch to within 2%.
- **Superseded runs:** an earlier pass of llama.rn and ExecuTorch is not used.
  It reused llama.rn's KV cache and ran both ExecuTorch backends in one
  process. Its decode speeds for llama.rn and ExecuTorch MLX match these
  within 3%. XNNPACK, which ran after MLX in the same process, was slower
  there (74 / 28 tok/s).

## Results

### Generation, 27-token prompt

| Runtime | Launches | TTFT (ms) | First run TTFT (ms) | Prefill (tok/s) | Decode (tok/s) | Peak footprint (MB) | Above app baseline (MB) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `core-ai-gpu` | 2 | 175 | 137 | 154 | **176.0** (175.9–176.1) | 465 | **264** |
| `mlx-swift` | 3 | 31 | 85 | 860 | 163.3 (162.4–165.7) | 499 | 489 |
| `executorch-mlx` | 1 | **23** | 509 | **1,174** | 149.8 | 582 | 408 |
| `llama.rn` | 1 | 51 | 66 | 531 | 137.0 | 1,305 | 1,108 |
| `core-ai` | 2 | 144 | 2,729 | 187 | 136.5 (135.4–137.6) | 1,630 | 1,428 |
| `executorch-xnnpack` | 1 | 62 | 65 | 435 | 82.5 | 1,230 | 1,052 |

### Generation, 1,003-token prompt

| Runtime | Launches | TTFT (ms) | First run TTFT (ms) | Prefill (tok/s) | Decode (tok/s) | Peak footprint (MB) | Above app baseline (MB) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `core-ai-gpu` | 2 | 227 | 324 | 4,410 | **135.1** (134.6–135.6) | 1,291 | 1,090 |
| `executorch-mlx` | 1 | 209 | 205 | 4,799 | 120.4 | 722 | **549** |
| `llama.rn` | 1 | 291 | 293 | 3,443 | 111.8 | 1,191 | 994 |
| `mlx-swift` | 3 | 208 | 206 | 4,821 | 107.5 (107.3–108.4) | 726 | 716 |
| `core-ai` | 2 | **154** | 282 | **6,531** | 77.2 (77.2–77.2) | 1,494 | 1,292 |
| `executorch-xnnpack` | 1 | 1,784 | 1,708 | 562 | 41.6 | 1,142 | 965 |

### Loading

Medians over the launches. "First token after a load" is the first generation
after loading. For runtimes without a separate measurement, it's the warmup
run of the short prompt.

| Runtime | First load in a process (ms) | Warm load (ms) | First token after a load (ms) |
| --- | --- | --- | --- |
| `core-ai` | 331 | 344 | 2,592 |
| `core-ai-gpu` | 365 | 330 | 124 |
| `mlx-swift` | 345 | 281 | 85 |
| `llama.rn` | 577 | 139 | 66 |
| `executorch-mlx` | 272 | 187 | 509 |
| `executorch-xnnpack` | 901 | 426 | 65 |

### Core AI cold start

The first launch after installing a model, with Core AI's specialization cache
(`Library/Caches/coreai-cache`) cleared. Medians of the launches:

| Export | Launches | Load (ms) | First token (ms) | `specialize()` (ms) | Load after it (ms) | First token after it (ms) |
| --- | --- | --- | --- | --- | --- | --- |
| `core-ai` (Neural Engine) | 2 | 329 | 102,820 (102,434–103,206) | 0.3 | 363 | 115,621 (110,889–120,353) |
| `core-ai-gpu` | 1 | 356 | 2,051 | 1 | 338 | 1,500 |

### Throttled launches

The third pass ran after the 5-minute cooldown limit, with the device at
`fair` or `serious`:

| Runtime | Thermal state | Decode short (tok/s) | Decode 1k (tok/s) | Prefill 1k (tok/s) |
| --- | --- | --- | --- | --- |
| `core-ai` | serious | 138.8 | 64.8 | 5,072 |
| `core-ai-gpu` | serious | 177.9 | 132.5 | 3,991 |
| `llama.rn` | fair | 137.3 | 108.8 | 3,421 |
| `executorch-mlx` | fair, then serious | 78.5 | 119.7 | 4,990 |
| `executorch-xnnpack` | fair | 75.8 | 37.8 | 420 |

- **Barely affected:** throttling moves decode by less than 3% for Core AI's
  GPU export, llama.rn and the Neural Engine's short prompt.
- **Hit hard:**
  - the Neural Engine's long-prompt decode (−16%) and prefill (−22%);
  - ExecuTorch MLX's short-prompt decode (−48%);
  - XNNPACK (−8% to −25%);
  - Core AI's GPU prefill (−10%).
- **Takeaway:** an earlier pass without cooldowns showed that sustained heat
  slows every runtime by 2–3 times, so comparisons need matching thermal
  states.

## Is Core AI as fast as MLX?

**Decode on the GPU: yes, and faster.** With a dynamic-shape 4-bit export the
same size as MLX's, Core AI decodes 8% faster on a short prompt and 26% faster
at 1k tokens of context. It also loads in about the same time and uses about
half of MLX's memory on a short prompt. MLX slows down more as the context
grows (163 → 108 tok/s) than Core AI's GPU path does (176 → 135 tok/s). One
caveat: Core AI's GPU memory grows with the prompt, to 1.1 GB above baseline
at 1k tokens against MLX's 0.7 GB.

**Prefill on the Neural Engine: fastest of all.** The Neural Engine prefills
a 1,003-token prompt at 6,531 tok/s, against 4,400–4,800 tok/s for the GPU
runtimes, so a long prompt gets its first token sooner (154 ms vs 208 ms for
MLX).

**Decode on the Neural Engine: no.** It decodes at 137 tok/s on a short prompt
and 77 tok/s at 1k tokens, 16% and 28% behind MLX. The reasons:

- **One token at a time:** decoding processes a single token per step, a
  workload GPUs handle well and the Neural Engine is not built for. Prefill is
  the opposite: many tokens per step, where the Neural Engine excels.
- **Fixed shapes:** the static export is compiled for fixed shapes and works
  over the full 4,096-token KV buffer, whatever the context length. That
  doesn't explain the drop from 137 to 77 tok/s at 1k tokens, though, which
  points to the chunked static-shape engine itself.
- **Heavier weights:** the iOS export keeps some layers at 8 bits (440 MB of
  weights against 336 MB for the 4-bit GPU export), so each decode step reads
  more weight data.

**Startup and memory favor MLX and the GPU export.** The Neural Engine export:

- compiles on its first prediction, about 103 s on a first launch;
- waits 2.6 s for the first token after every load, even with the compile
  cached;
- takes 2–3 times MLX's memory above the app baseline.

`specialize()` takes under 1 ms and doesn't move the compile out of the first
generation, so it can't be used to warm the model up ahead of time.

**Other runtimes:**
- **ExecuTorch with its MLX backend** decodes within 8% of mlx-swift on a
  short prompt and 12% faster at 1k tokens. Its first generation after a load
  takes 0.5 s.
- **llama.rn** decodes on par with the Neural Engine export on a short prompt,
  and 45% faster at 1k tokens. Its 4,096-token f16 KV cache costs about 1.1
  GB.
- **XNNPACK on the CPU** is the slowest by far.

The JS-side timing through the AI SDK and a dev-mode bundle may cost the React
Native runtimes a little against the native MLX app. Core AI's GPU export and
ExecuTorch MLX still came out ahead of mlx-swift at 1k tokens with that cost
included.

## Follow-ups

- More nominal launches of llama.rn and ExecuTorch, since each has one here.
  This needs longer cooldowns between configurations than the 5-minute cap.
- Qwen3 4B (`mlboydaisuke/qwen3-4b-CoreAI-official` has both iOS and macOS
  exports), where memory bandwidth matters more than for a 0.6B model.
- Whether Apple's recipe can export dynamic shapes for iOS, since that export
  is the fastest Core AI configuration here.
