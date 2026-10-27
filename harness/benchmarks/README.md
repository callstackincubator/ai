# Runtime benchmarks

Measures the same language models on the on-device runtimes this repo works
with, on one iPhone:

| File | Runtime |
| --- | --- |
| `core-ai.device.benchmark.harness.ts` | `@react-native-ai/core-ai`, static-shape export (Neural Engine) |
| `core-ai-gpu.device.benchmark.harness.ts` | `@react-native-ai/core-ai`, dynamic-shape export (GPU) |
| `core-ai-cold-start.device.benchmark.harness.ts` | Core AI's first launch, both exports |
| `llama.device.benchmark.harness.ts` | `@react-native-ai/llama` (llama.rn) |
| `executorch-mlx.device.benchmark.harness.ts` | `react-native-executorch`, MLX backend |
| `executorch-xnnpack.device.benchmark.harness.ts` | `react-native-executorch`, XNNPACK backend |
| `mlx/` | mlx-swift-lm in a minimal Swift app |

The models, and which export of each every runtime gets, are in `models.ts`:
Qwen3 0.6B and Qwen3 1.7B, at about 4-bit weights. Qwen3 1.7B has no Neural
Engine export.

Results are in [RESULTS.md](RESULTS.md), with the raw data in `results/`.

## Protocol

This is protocol version 2 (`PROTOCOL_VERSION` in `measure.ts`, recorded with
every result). `collect.ts` only combines results of one version.

- **Prompts**: `prompts.ts`, 27 and 1,003 prompt tokens with Qwen3's
  tokenizer. Greedy decoding (temperature 0), thinking off.
- **Fixed output length**: at most 256 output tokens, and both prompts ask for
  more, so every run decodes the same number of tokens. A run that stops
  earlier is recorded but left out of the statistics (`shortRuns`). End of
  sequence is not ignored, since Core AI has no option for it.
- **Runs**: per prompt, 3 warmup runs that are not counted (the first is
  reported as `first`), then 10 measured runs. Results report the median with
  the interquartile range and the range (`spread`).
- **Launches**: `run.sh` runs every configuration 3 times by default, each in
  a new app process, interleaving the runtimes rather than running one
  configuration back to back. `collect.ts` pools the valid runs of every launch
  and also shows the range of the launch medians.
- **Thermal state**: before every run, the benchmark waits up to 5 minutes for
  the device to be `nominal`. The thermal state is sampled every 10 ms during
  each run, and a run that reached `fair` or worse is left out
  (`throttledRuns`). iOS has no temperature API, so this is the only control.
- **Load**: the first load in the process, the median of 3 loads after it,
  and the time to the first token after a load.
- **Core AI cold start**: with its specialization cache cleared, the load and
  the first token, which is when Core AI compiles the model for the Neural
  Engine. Then the same after `specialize()`. It runs last, since the compile
  heats the device.
- **Timing**: time to first token (TTFT) is from the call to the first token,
  including the chat template and tokenization. Prefill is prompt tokens over
  TTFT. Decode is the tokens after the first over the time between the first
  and the last token.
- **Native timings and JS overhead**: the harness can only run a debug build,
  where JS runs from a dev bundle, so tokens may reach JS later than the
  runtime produces them. Each runtime's own timings are recorded next to the
  JS ones: Core AI's (measured in its native stream), llama.cpp's and
  ExecuTorch's runner. `collect.ts` shows the native decode speed and how much
  slower decode looks from JS. The MLX app has no JS.
- **Memory**: the process footprint (`phys_footprint`, what jetsam limits),
  sampled every 10 ms on a native thread, through the `device-stats` module in
  `apps/expo-example/modules`; the MLX app reads it the same way. Peak is over
  all runs of a prompt and is shown above the footprint before the model
  loaded. After the model is unloaded, the benchmark records what it kept
  above that baseline (`retainedMB`). The footprint may not count all of the
  GPU memory a runtime uses, so GPU figures are lower bounds.

The React Native runtimes run in the harness, with the AI SDK's `streamText`
where the provider has one (Core AI, llama.rn). ExecuTorch's runner is called
directly, because its chat session can't turn Qwen3's thinking off.

## Running

The React Native runtimes run in a debug build of the example app (the harness
loads tests from Metro), compiled with optimization so the native code runs at
release speed. ExecuTorch is linked only with `EXECUTORCH=1`, and its native
libraries are downloaded by hand:

```bash
node node_modules/react-native-executorch/scripts/download-libs.js
```

```bash
cd apps/expo-example
CORE_AI=1 EXECUTORCH=1 npx expo prebuild --clean --platform ios
xcodebuild -workspace ios/reactnativeaiexample.xcworkspace -scheme reactnativeaiexample \
  -configuration Debug -destination "id=$DEVICE" -derivedDataPath ios/build \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=$TEAM \
  SWIFT_OPTIMIZATION_LEVEL=-O GCC_OPTIMIZATION_LEVEL=s build
xcrun devicectl device install app --device "$DEVICE" \
  ios/build/Build/Products/Debug-iphoneos/reactnativeaiexample.app
```

Then the configurations, one at a time, so they don't share a process.
`MODEL` picks the model (`qwen3-0.6b` by default) and `LAUNCHES` the number of
launches. The results go to `benchmarks.jsonl` in the app's documents, and
`run.sh` copies them to `harness/benchmarks/benchmarks.jsonl`:

```bash
DEVICE=<udid> HARNESS_IOS_DEVICE="<device name>" MODEL=qwen3-1.7b harness/benchmarks/run.sh
```

The MLX app builds with XcodeGen (`brew install xcodegen`) and Xcode:

```bash
DEVICE=<udid> TEAM=<team id> MODEL=qwen3-1.7b harness/benchmarks/mlx/run.sh | tee mlx.log
```

`collect.ts` turns the logs into the tables in RESULTS.md, one section per
model:

```bash
bun harness/benchmarks/collect.ts harness/benchmarks/benchmarks.jsonl mlx.log
```
