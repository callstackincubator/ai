# Runtime benchmarks

Measures the same language model on the on-device runtimes this repo works
with, on one iPhone:

| File | Runtime |
| --- | --- |
| `core-ai.device.benchmark.harness.ts` | `@react-native-ai/core-ai`, iOS export (Neural Engine) |
| `core-ai-gpu.device.benchmark.harness.ts` | `@react-native-ai/core-ai`, macOS export (GPU) |
| `core-ai-cold-start.device.benchmark.harness.ts` | Core AI's first launch, both exports |
| `llama.device.benchmark.harness.ts` | `@react-native-ai/llama` (llama.rn) |
| `executorch-mlx.device.benchmark.harness.ts` | `react-native-executorch`, MLX backend |
| `executorch-xnnpack.device.benchmark.harness.ts` | `react-native-executorch`, XNNPACK backend |
| `mlx/` | mlx-swift-lm in a minimal Swift app |

Results are in [RESULTS.md](RESULTS.md), with the raw data in `results/`.

## What is measured

Every runtime gets the prompts in `prompts.ts` (27 and 1,003 prompt tokens
with Qwen3's tokenizer), greedy decoding (temperature 0), thinking off and at
most 256 output tokens. Both prompts ask for more than 256 tokens, so every run
decodes all 256.

- **Load**: the first load in the process, the median of 3 loads after it,
  and the time to the first token after a load.
- **Core AI cold start**: with its specialization cache cleared, the load and
  the first token, which is when Core AI compiles the model for the Neural
  Engine. Then the same after `specialize()`. It runs last, since the compile
  heats the device.
- **Generation**: one warmup run (reported as `first`), then the median of 3
  runs. Time to first
  token (TTFT) is from the call to the first token, including the chat template
  and tokenization. Prefill is prompt tokens over TTFT. Decode is the tokens
  after the first over the time between the first and the last.
- **Memory**: the process footprint (`phys_footprint`, what jetsam limits),
  sampled every 10 ms. It counts Metal and Neural Engine buffers the process
  owns. Peak is over all runs of a prompt. The React Native runtimes report it
  through the `device-stats` module in `apps/expo-example/modules`, and the
  MLX app reads it the same way.

- **Thermal state**: each stage waits up to 5 minutes for the device to cool
  down to `nominal`, and results record the thermal state and Low Power Mode
  before and after the runs. Back-to-back runs throttle an iPhone by 2 to 3
  times.

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

Then the configurations, one at a time, so they don't share a process. The
results go to `benchmarks.jsonl` in the app's documents, and `run.sh` copies
them to `harness/benchmarks/benchmarks.jsonl`:

```bash
DEVICE=<udid> HARNESS_IOS_DEVICE="<device name>" harness/benchmarks/run.sh
```

The MLX app builds with XcodeGen (`brew install xcodegen`) and Xcode:

```bash
DEVICE=<udid> TEAM=<team id> harness/benchmarks/mlx/run.sh | tee mlx.log
```

`collect.ts` turns the logs into the tables in RESULTS.md. It takes the median
over launches, and leaves out runs that started or ended throttled unless
`--all` is passed:

```bash
bun harness/benchmarks/collect.ts harness/benchmarks/benchmarks.jsonl mlx.log
```
