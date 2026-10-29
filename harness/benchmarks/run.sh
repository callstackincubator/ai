#!/usr/bin/env bash

# Runs the React Native runtime benchmarks one at a time, each in its own app
# process, then copies the results off the device. Install the example app
# first (see README.md).
#
#   DEVICE=<udid> HARNESS_IOS_DEVICE="<device name>" [MODEL=qwen3-1.7b] \
#     [LAUNCHES=3] harness/benchmarks/run.sh [config...]
#
# Configurations: core-ai core-ai-gpu llama executorch-mlx executorch-xnnpack
# core-ai-cold-start (last by default, since the compile heats the device).
# Each launch runs every configuration once, so the launches of one
# configuration are spread over the run rather than back to back

set -euo pipefail

: "${DEVICE:?Set DEVICE to the device UDID}"
: "${HARNESS_IOS_DEVICE:?Set HARNESS_IOS_DEVICE to the device name}"

BENCHMARKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# One of the models in models.ts, inlined into the bundle
export EXPO_PUBLIC_BENCHMARK_MODEL="${MODEL:-qwen3-0.6b}"
case "$EXPO_PUBLIC_BENCHMARK_MODEL" in
  # No Neural Engine export
  qwen3-1.7b) DEFAULT_CONFIGS="core-ai-gpu llama executorch-mlx executorch-xnnpack" ;;
  *) DEFAULT_CONFIGS="core-ai core-ai-gpu llama executorch-mlx executorch-xnnpack" ;;
esac
CONFIGS=("${@:-$DEFAULT_CONFIGS}")
LAUNCHES="${LAUNCHES:-3}"
# Lets the phone cool down between runtimes, so one doesn't throttle the next
COOLDOWN="${COOLDOWN:-60}"

cd "$BENCHMARKS_DIR/../../apps/example"

run() {
  echo "Running $1 with $EXPO_PUBLIC_BENCHMARK_MODEL"
  HARNESS_BENCHMARK=true npx react-native-harness --harnessRunner ios \
    "../../harness/benchmarks/$1.device.benchmark.harness.ts" ||
    echo "$1 failed"
  sleep "$COOLDOWN"
}

for launch in $(seq "$LAUNCHES"); do
  echo "Launch $launch of $LAUNCHES"
  for config in ${CONFIGS[@]}; do
    run "$config"
  done
done
# The compile heats the device, so cold starts run last, without the
# configurations given explicitly
if [ $# -eq 0 ]; then
  run core-ai-cold-start
fi

xcrun devicectl device copy from --device "$DEVICE" \
  --domain-type appDataContainer --domain-identifier com.callstack.ai.example \
  --source Documents/benchmarks.jsonl --destination "$BENCHMARKS_DIR/benchmarks.jsonl"
echo "Results in $BENCHMARKS_DIR/benchmarks.jsonl"
